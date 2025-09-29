#!/bin/bash

# Quick test script for AGI Egg Intent Recognition

API_URL="https://agi-egg-isr-router-1028435695123.us-central1.run.app"

echo "==================================="
echo "AGI Egg Quick Intent Test"
echo "==================================="
echo ""

# Test 1: Health check
echo "1. Health Check..."
HEALTH=$(curl -s -X GET "$API_URL/health" --max-time 5)
if echo "$HEALTH" | grep -q "ok"; then
    echo "✅ Health check passed"
else
    echo "❌ Health check failed"
fi
echo ""

# Test 2: Intent recognition (with timeout)
echo "2. Testing Intent Recognition..."
echo "   Input: 'I need to reset my password'"

RESPONSE=$(curl -s -X POST "$API_URL/intent/recognize" \
    -H "Content-Type: application/json" \
    -d '{"text":"I need to reset my password"}' \
    --max-time 15 2>/dev/null)

if [ $? -eq 0 ]; then
    if echo "$RESPONSE" | grep -q "recognizedIntent"; then
        echo "✅ Intent recognized successfully"
        echo "   Response preview:"
        echo "$RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(f\"   Category: {data['recognizedIntent']['category']}\"); print(f\"   Confidence: {data['recognizedIntent']['confidence']}\"); print(f\"   Service: {data['routing']['targetService']}\")" 2>/dev/null || echo "   (Could not parse response)"
    else
        echo "⚠️  Response received but format unexpected"
        echo "   Response: ${RESPONSE:0:100}..."
    fi
else
    echo "❌ Request timed out or failed"
fi
echo ""

# Test 3: Try /intent/test endpoint
echo "3. Testing Intent Test Endpoint..."
TEST_RESPONSE=$(curl -s -X POST "$API_URL/intent/test" \
    -H "Content-Type: application/json" \
    -d '{"text":"Process payment for premium subscription"}' \
    --max-time 15 2>/dev/null)

if [ $? -eq 0 ]; then
    if echo "$TEST_RESPONSE" | grep -q "wouldRoute"; then
        echo "✅ Test endpoint working"
        echo "   Simulation result received"
    else
        echo "⚠️  Test endpoint returned unexpected format"
    fi
else
    echo "❌ Test endpoint timeout"
fi
echo ""

echo "==================================="
echo "Test Complete"
echo "==================================="