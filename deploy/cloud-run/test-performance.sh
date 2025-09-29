#!/bin/bash

# Performance Testing Script for Cloud Run Service
# Tests response times and identifies bottlenecks

set -e

SERVICE_URL="https://agi-egg-isr-router-1028435695123.us-central1.run.app"

echo "==========================================="
echo "Cloud Run Performance Testing"
echo "==========================================="
echo ""
echo "Service URL: $SERVICE_URL"
echo ""

# Create timing format file
cat > curl-format.txt << 'EOF'
    time_namelookup:  %{time_namelookup}s\n
       time_connect:  %{time_connect}s\n
    time_appconnect:  %{time_appconnect}s\n
   time_pretransfer:  %{time_pretransfer}s\n
      time_redirect:  %{time_redirect}s\n
 time_starttransfer:  %{time_starttransfer}s\n
                    ----------\n
         time_total:  %{time_total}s\n
EOF

echo "1. Testing Health Endpoint Performance"
echo "======================================="
echo "Warming up service with 3 requests..."
for i in 1 2 3; do
    curl -s -o /dev/null "$SERVICE_URL/health"
    echo -n "."
done
echo " Done!"
echo ""

echo "Measuring health check response time:"
curl -w "@curl-format.txt" -o /dev/null -s "$SERVICE_URL/health"

echo ""
echo "2. Testing Intent Recognition Performance"
echo "=========================================="
echo "Test payload: Simple intent recognition"
echo ""

# Test simple intent
echo "Simple intent test:"
time curl -X POST "$SERVICE_URL/api/intent/recognize" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello"}' \
  -w "@curl-format.txt" \
  -o /dev/null -s

echo ""
echo "3. Testing Complex Intent Recognition"
echo "======================================"
echo "Test payload: Complex intent with context"
echo ""

# Test complex intent
echo "Complex intent test:"
time curl -X POST "$SERVICE_URL/api/intent/recognize" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "I need to process a payment for my premium subscription and also update my billing address",
    "context": {
      "user_id": "test-user-123",
      "session_id": "test-session-456",
      "timestamp": "2024-09-29T00:00:00Z"
    }
  }' \
  -w "@curl-format.txt" \
  -o /dev/null -s

echo ""
echo "4. Running Latency Analysis (10 requests)"
echo "=========================================="
echo "Analyzing response time distribution..."
echo ""

TOTAL_TIME=0
MIN_TIME=999999
MAX_TIME=0

for i in {1..10}; do
    START=$(date +%s%N)
    curl -s -o /dev/null "$SERVICE_URL/health"
    END=$(date +%s%N)

    DIFF=$((($END - $START) / 1000000))
    TOTAL_TIME=$(($TOTAL_TIME + $DIFF))

    if [ $DIFF -lt $MIN_TIME ]; then
        MIN_TIME=$DIFF
    fi

    if [ $DIFF -gt $MAX_TIME ]; then
        MAX_TIME=$DIFF
    fi

    echo "Request $i: ${DIFF}ms"
done

AVG_TIME=$(($TOTAL_TIME / 10))

echo ""
echo "Latency Statistics:"
echo "==================="
echo "Min: ${MIN_TIME}ms"
echo "Max: ${MAX_TIME}ms"
echo "Avg: ${AVG_TIME}ms"

echo ""
echo "5. Checking Service Configuration"
echo "=================================="
echo "Getting current Cloud Run configuration..."
echo ""

gcloud run services describe agi-egg-isr-router \
    --region=us-central1 \
    --format="table(
        spec.template.spec.containers[0].resources.limits.cpu:label='CPU',
        spec.template.spec.containers[0].resources.limits.memory:label='Memory',
        spec.template.metadata.annotations.'autoscaling.knative.dev/minScale':label='Min Instances',
        spec.template.metadata.annotations.'autoscaling.knative.dev/maxScale':label='Max Instances',
        spec.template.spec.containerConcurrency:label='Concurrency'
    )" 2>/dev/null || echo "Unable to fetch Cloud Run configuration (requires gcloud auth)"

echo ""
echo "6. Performance Recommendations"
echo "==============================="

if [ $AVG_TIME -gt 1000 ]; then
    echo "⚠️  High average latency detected (${AVG_TIME}ms)"
    echo ""
    echo "Recommendations:"
    echo "1. Run ./optimize-performance.sh to apply optimizations"
    echo "2. Consider increasing minimum instances to avoid cold starts"
    echo "3. Check if Redis connection is causing delays"
    echo "4. Review Gemini API response times"
elif [ $AVG_TIME -gt 500 ]; then
    echo "⚠️  Moderate latency detected (${AVG_TIME}ms)"
    echo ""
    echo "Recommendations:"
    echo "1. Consider enabling startup CPU boost"
    echo "2. Monitor for cold start patterns"
    echo "3. Check Redis cache hit rates"
else
    echo "✅ Good performance (${AVG_TIME}ms average)"
    echo "Service is responding within acceptable limits"
fi

echo ""
echo "7. Checking Dependencies"
echo "========================"
echo ""

# Check Redis connectivity (via health endpoint that includes Redis check)
echo "Testing Redis connection via ready endpoint:"
READY_RESPONSE=$(curl -s "$SERVICE_URL/health/ready" 2>/dev/null || echo '{"status":"unknown"}')
echo "$READY_RESPONSE" | grep -q '"redis":"connected"' && echo "✅ Redis: Connected" || echo "⚠️  Redis: Connection issue"

# Check Gemini API (indirect test via intent endpoint)
echo ""
echo "Testing Gemini API integration:"
GEMINI_TEST=$(curl -s -X POST "$SERVICE_URL/api/intent/recognize" \
  -H "Content-Type: application/json" \
  -d '{"text": "test"}' 2>/dev/null || echo '{"error":"failed"}')
echo "$GEMINI_TEST" | grep -q '"intent"' && echo "✅ Gemini API: Working" || echo "⚠️  Gemini API: Issue detected"

# Clean up
rm -f curl-format.txt

echo ""
echo "==========================================="
echo "Performance testing complete!"
echo "==========================================="