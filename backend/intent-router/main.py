from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import json
import os
import asyncio
import aiohttp
import numpy as np
from datetime import datetime
import redis.asyncio as redis
import hashlib
from transformers import pipeline
import logging
from prometheus_client import Counter, Histogram, Gauge, generate_latest
from circuitbreaker import circuit
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Intent Recognition Router", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Metrics
request_counter = Counter('router_requests_total', 'Total requests', ['service', 'intent'])
latency_histogram = Histogram('router_latency_seconds', 'Request latency')
cache_hits = Counter('router_cache_hits_total', 'Cache hits')
cache_misses = Counter('router_cache_misses_total', 'Cache misses')
active_connections = Gauge('router_active_connections', 'Active connections')

# Configuration
META_ROUTING_CONFIG = json.loads(os.getenv('META_ROUTING_CONFIG', '{}'))
ROUTING_RULES = json.loads(os.getenv('ROUTING_RULES', '{}'))
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')
ML_MODEL_ENDPOINT = os.getenv('ML_MODEL_ENDPOINT', '')

# Initialize Redis
redis_client = None

# Initialize ML Pipeline
intent_classifier = None

class IntentRequest(BaseModel):
    text: Optional[str] = None
    path: Optional[str] = None
    method: Optional[str] = "GET"
    headers: Optional[Dict[str, str]] = {}
    body: Optional[Any] = None
    context: Optional[Dict[str, Any]] = {}

class IntentResponse(BaseModel):
    intentId: str
    recognizedIntent: Dict[str, Any]
    routing: Dict[str, Any]
    metadata: Dict[str, Any]
    contextualFactors: Optional[Dict[str, float]] = None

class ServiceRegistry:
    def __init__(self):
        self.services = {
            "user-authentication-service": {
                "url": "https://user-authentication-service.run.app",
                "health": "/health",
                "timeout": 10000
            },
            "payment-processing-service": {
                "url": "https://payment-processing-service.run.app",
                "health": "/healthz",
                "timeout": 30000
            },
            "email-notification-service": {
                "url": "https://email-notification-service.run.app",
                "health": "/health/live",
                "timeout": 15000
            },
            "image-processing-service": {
                "url": "https://image-processing-service.run.app",
                "health": "/ping",
                "timeout": 120000
            },
            "data-analytics-service": {
                "url": "https://data-analytics-service.run.app",
                "health": "/health/liveness",
                "timeout": 30000
            },
            "pdf-generator-service": {
                "url": "https://pdf-generator-service.run.app",
                "health": "/healthcheck",
                "timeout": 60000
            },
            "websocket-chat-service": {
                "url": "https://websocket-chat-service.run.app",
                "health": "/ws/health",
                "timeout": 3600000
            },
            "machine-learning-inference-service": {
                "url": "https://machine-learning-inference-service.run.app",
                "health": "/v1/models/recommendation-model",
                "timeout": 60000
            },
            "scheduled-batch-processor-service": {
                "url": "https://scheduled-batch-processor-service.run.app",
                "health": "/health",
                "timeout": 1800000
            },
            "api-gateway-service": {
                "url": "https://api-gateway-service.run.app",
                "health": "/health/live",
                "timeout": 30000
            }
        }
        self.health_status = {}

    async def check_health(self, service_name: str) -> bool:
        try:
            service = self.services.get(service_name)
            if not service:
                return False

            async with aiohttp.ClientSession() as session:
                url = f"{service['url']}{service['health']}"
                async with session.get(url, timeout=5) as response:
                    return response.status == 200
        except:
            return False

    async def update_health_status(self):
        for service_name in self.services:
            is_healthy = await self.check_health(service_name)
            self.health_status[service_name] = {
                "status": "healthy" if is_healthy else "unhealthy",
                "last_checked": datetime.utcnow().isoformat()
            }

service_registry = ServiceRegistry()

class IntentRecognitionEngine:
    def __init__(self):
        self.meta_routing_config = None
        self.routing_rules = None
        self.load_configuration()

    def load_configuration(self):
        try:
            with open('/config/meta-routing.json', 'r') as f:
                self.meta_routing_config = json.load(f)
            with open('/config/routing-rules.json', 'r') as f:
                self.routing_rules = json.load(f)
        except:
            self.meta_routing_config = META_ROUTING_CONFIG
            self.routing_rules = ROUTING_RULES

    async def classify_intent(self, request: IntentRequest) -> Dict[str, Any]:
        start_time = time.time()

        # Generate cache key
        cache_key = self._generate_cache_key(request)

        # Check cache
        cached_result = await self._get_from_cache(cache_key)
        if cached_result:
            cache_hits.inc()
            cached_result['metadata']['cacheHit'] = True
            return cached_result

        cache_misses.inc()

        # Perform intent classification
        intent_scores = await self._calculate_intent_scores(request)

        # Apply contextual factors
        contextual_scores = self._apply_contextual_factors(request, intent_scores)

        # Determine best match
        best_intent = self._select_best_intent(contextual_scores)

        # Build response
        response = {
            "intentId": self._generate_intent_id(),
            "recognizedIntent": {
                "category": best_intent['category'],
                "confidence": best_intent['confidence'],
                "keywords": best_intent.get('keywords', []),
                "mlModel": best_intent.get('mlModel')
            },
            "routing": {
                "targetService": best_intent['targetService'],
                "priority": best_intent.get('priority', 100),
                "strategy": self.meta_routing_config.get('metaRoutingEngine', {}).get('algorithmType', 'ml-enhanced'),
                "timeout": service_registry.services.get(best_intent['targetService'], {}).get('timeout', 30000)
            },
            "metadata": {
                "processingTime": (time.time() - start_time) * 1000,
                "cacheHit": False,
                "modelVersion": "v1.0.0"
            },
            "contextualFactors": contextual_scores.get('factors')
        }

        # Cache result
        await self._cache_result(cache_key, response)

        # Update metrics
        request_counter.labels(service=best_intent['targetService'], intent=best_intent['category']).inc()
        latency_histogram.observe(time.time() - start_time)

        return response

    async def _calculate_intent_scores(self, request: IntentRequest) -> Dict[str, Any]:
        scores = {}

        # Text-based classification if available
        if request.text and intent_classifier:
            ml_scores = await self._ml_classify(request.text)
            scores['ml'] = ml_scores

        # Rule-based classification
        rule_scores = self._apply_routing_rules(request)
        scores['rules'] = rule_scores

        # Pattern matching
        pattern_scores = self._match_patterns(request)
        scores['patterns'] = pattern_scores

        return scores

    async def _ml_classify(self, text: str) -> Dict[str, float]:
        try:
            if intent_classifier:
                results = intent_classifier(text)
                return {r['label']: r['score'] for r in results}
        except:
            pass
        return {}

    def _apply_routing_rules(self, request: IntentRequest) -> Dict[str, float]:
        scores = {}

        for rule in self.routing_rules.get('rules', []):
            if self._evaluate_rule_conditions(rule, request):
                service = rule['actions']['route']
                priority = rule['actions'].get('priority', 100)
                scores[service] = priority / 1000.0

        return scores

    def _match_patterns(self, request: IntentRequest) -> Dict[str, float]:
        scores = {}

        for category, config in self.meta_routing_config.get('intentCategories', {}).items():
            score = 0.0

            # Check keywords in text
            if request.text and config.get('keywords'):
                text_lower = request.text.lower()
                matching_keywords = sum(1 for kw in config['keywords'] if kw in text_lower)
                if matching_keywords > 0:
                    score = matching_keywords / len(config['keywords'])

            # Check path patterns
            if request.path and config.get('patterns'):
                import re
                for pattern in config['patterns']:
                    if re.match(pattern, request.path):
                        score = max(score, 0.8)
                        break

            if score > 0:
                scores[config['targetService']] = score

        return scores

    def _apply_contextual_factors(self, request: IntentRequest, intent_scores: Dict[str, Any]) -> Dict[str, Any]:
        factors = {}

        if self.meta_routing_config.get('contextualFactors'):
            for factor_name, factor_config in self.meta_routing_config['contextualFactors'].items():
                factor_score = self._calculate_factor_score(factor_name, request, factor_config)
                factors[factor_name] = factor_score

        # Combine scores
        combined_scores = self._combine_scores(intent_scores, factors)

        return {
            'scores': combined_scores,
            'factors': factors
        }

    def _calculate_factor_score(self, factor_name: str, request: IntentRequest, config: Dict) -> float:
        # Simplified factor calculation
        base_score = 0.5

        if factor_name == 'userProfile' and request.context.get('userId'):
            base_score = 0.7
        elif factor_name == 'requestMetadata' and request.headers:
            base_score = 0.6
        elif factor_name == 'systemState':
            # Check service health
            base_score = 0.8
        elif factor_name == 'temporalContext':
            # Time-based scoring
            hour = datetime.utcnow().hour
            if 9 <= hour <= 17:  # Business hours
                base_score = 0.9
            else:
                base_score = 0.4
        elif factor_name == 'businessLogic':
            base_score = 0.75

        return base_score * config.get('weight', 1.0)

    def _combine_scores(self, intent_scores: Dict[str, Any], factors: Dict[str, float]) -> Dict[str, float]:
        combined = {}

        # Aggregate all service scores
        all_services = set()
        for score_type, scores in intent_scores.items():
            if isinstance(scores, dict):
                all_services.update(scores.keys())

        for service in all_services:
            service_score = 0.0
            count = 0

            for score_type, scores in intent_scores.items():
                if isinstance(scores, dict) and service in scores:
                    service_score += scores[service]
                    count += 1

            if count > 0:
                combined[service] = service_score / count

        return combined

    def _select_best_intent(self, contextual_scores: Dict[str, Any]) -> Dict[str, Any]:
        scores = contextual_scores.get('scores', {})

        if not scores:
            # Fallback to API gateway
            return {
                'category': 'general',
                'confidence': 0.0,
                'targetService': 'api-gateway-service',
                'priority': 100
            }

        # Find service with highest score
        best_service = max(scores, key=scores.get)
        confidence = scores[best_service]

        # Find category info
        category_info = None
        for category, config in self.meta_routing_config.get('intentCategories', {}).items():
            if config.get('targetService') == best_service:
                category_info = config
                category_info['category'] = category
                break

        if not category_info:
            category_info = {
                'category': 'unknown',
                'targetService': best_service,
                'priority': 100
            }

        category_info['confidence'] = confidence

        return category_info

    def _evaluate_rule_conditions(self, rule: Dict, request: IntentRequest) -> bool:
        conditions = rule.get('conditions', {})

        if 'AND' in conditions:
            return all(self._evaluate_condition(cond, request) for cond in conditions['AND'])
        elif 'OR' in conditions:
            return any(self._evaluate_condition(cond, request) for cond in conditions['OR'])

        return False

    def _evaluate_condition(self, condition: Dict, request: IntentRequest) -> bool:
        cond_type = condition.get('type')
        operator = condition.get('operator')
        value = condition.get('value')

        if cond_type == 'path':
            return self._match_value(request.path, operator, value)
        elif cond_type == 'method':
            return self._match_value(request.method, operator, value)
        elif cond_type == 'header':
            key = condition.get('key')
            header_value = request.headers.get(key) if request.headers else None
            return self._match_value(header_value, operator, value)
        elif cond_type == 'any':
            return operator == 'true'

        return False

    def _match_value(self, actual: Any, operator: str, expected: Any) -> bool:
        if actual is None:
            return False

        if operator == 'equals':
            return actual == expected
        elif operator == 'matches':
            import re
            return bool(re.match(expected, str(actual)))
        elif operator == 'contains':
            return expected in str(actual)
        elif operator == 'starts':
            return str(actual).startswith(expected)
        elif operator == 'in':
            return actual in expected
        elif operator == 'exists':
            return actual is not None
        elif operator == 'greater':
            return float(actual) > float(expected)

        return False

    def _generate_cache_key(self, request: IntentRequest) -> str:
        key_data = {
            'text': request.text,
            'path': request.path,
            'method': request.method,
            'headers': request.headers
        }
        key_str = json.dumps(key_data, sort_keys=True)
        return f"intent:{hashlib.md5(key_str.encode()).hexdigest()}"

    def _generate_intent_id(self) -> str:
        import uuid
        return str(uuid.uuid4())

    async def _get_from_cache(self, key: str) -> Optional[Dict]:
        if redis_client:
            try:
                data = await redis_client.get(key)
                if data:
                    return json.loads(data)
            except:
                pass
        return None

    async def _cache_result(self, key: str, result: Dict):
        if redis_client:
            try:
                ttl = self.meta_routing_config.get('routingStrategies', {}).get('caching', {}).get('ttl', 300)
                await redis_client.setex(key, ttl, json.dumps(result))
            except:
                pass

intent_engine = IntentRecognitionEngine()

@app.on_event("startup")
async def startup():
    global redis_client, intent_classifier

    # Initialize Redis
    try:
        redis_client = await redis.from_url(REDIS_URL)
        await redis_client.ping()
        logger.info("Redis connected successfully")
    except Exception as e:
        logger.warning(f"Failed to connect to Redis: {e}")

    # Initialize ML model
    try:
        intent_classifier = pipeline("zero-shot-classification", model="facebook/bart-large-mnli")
        logger.info("ML model loaded successfully")
    except Exception as e:
        logger.warning(f"Failed to load ML model: {e}")

    # Start health check background task
    asyncio.create_task(health_check_loop())

async def health_check_loop():
    while True:
        await service_registry.update_health_status()
        await asyncio.sleep(30)

@app.post("/intent/recognize", response_model=IntentResponse)
async def recognize_intent(request: IntentRequest):
    active_connections.inc()
    try:
        result = await intent_engine.classify_intent(request)
        return result
    finally:
        active_connections.dec()

@app.post("/intent/analyze", response_model=IntentResponse)
async def analyze_intent(text: str):
    request = IntentRequest(text=text)
    return await intent_engine.classify_intent(request)

@app.get("/health/services")
async def get_service_health():
    return service_registry.health_status

@app.get("/health/live")
async def liveness_probe():
    return {"status": "healthy"}

@app.get("/health/ready")
async def readiness_probe():
    # Check critical dependencies
    checks = {
        "redis": False,
        "services": False
    }

    if redis_client:
        try:
            await redis_client.ping()
            checks["redis"] = True
        except:
            pass

    if service_registry.health_status:
        checks["services"] = True

    is_ready = all(checks.values())

    if is_ready:
        return {"status": "ready", "checks": checks}
    else:
        raise HTTPException(status_code=503, detail={"status": "not ready", "checks": checks})

@app.get("/metrics")
async def get_metrics():
    return generate_latest()

@app.post("/config/reload")
async def reload_configuration():
    intent_engine.load_configuration()
    return {"success": True, "message": "Configuration reloaded"}

@app.post("/intent/test")
async def test_route(request: IntentRequest):
    route = await intent_engine.classify_intent(request)

    # Simulate routing
    simulation = {
        "wouldRoute": route['recognizedIntent']['confidence'] >= 0.7,
        "targetService": route['routing']['targetService'],
        "estimatedLatency": route['routing']['timeout'] * 0.1,
        "confidence": route['recognizedIntent']['confidence']
    }

    return {
        "route": route,
        "simulation": simulation
    }

@app.post("/route")
@circuit(failure_threshold=5, recovery_timeout=30, expected_exception=Exception)
async def route_request(request: Request):
    # Parse request
    intent_request = IntentRequest(
        path=str(request.url.path),
        method=request.method,
        headers=dict(request.headers),
        body=await request.body()
    )

    # Classify intent
    intent_response = await intent_engine.classify_intent(intent_request)

    # Get target service
    target_service = intent_response['routing']['targetService']
    service_config = service_registry.services.get(target_service)

    if not service_config:
        raise HTTPException(status_code=503, detail=f"Service {target_service} not found")

    # Forward request
    async with aiohttp.ClientSession() as session:
        url = f"{service_config['url']}{intent_request.path}"

        async with session.request(
            method=intent_request.method,
            url=url,
            headers=intent_request.headers,
            data=intent_request.body,
            timeout=service_config['timeout'] / 1000
        ) as response:
            content = await response.read()

            return {
                "status": response.status,
                "headers": dict(response.headers),
                "body": content.decode('utf-8', errors='ignore'),
                "routing": {
                    "service": target_service,
                    "intentId": intent_response['intentId']
                }
            }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)