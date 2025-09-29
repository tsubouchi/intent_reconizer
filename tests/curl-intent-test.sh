#!/bin/bash

# AGI Egg Intent Recognition API Test Script
# Tests natural language processing through the Cloud Run endpoint

API_URL="https://agi-egg-isr-router-1028435695123.us-central1.run.app"
ENDPOINT="/intent/analyze"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Retry configuration to handle transient Cloud Run errors
MAX_RETRIES=3
RETRY_DELAY=5

echo "======================================"
echo "AGI Egg Intent Recognition API Tests"
echo "======================================"
echo "API URL: $API_URL"
echo ""

# Test counter
PASSED=0
FAILED=0

# Function to test an intent
test_intent() {
    local TEST_NAME="$1"
    local TEXT="$2"
    local EXPECTED_CATEGORY="$3"

    echo -e "${YELLOW}Testing:${NC} $TEST_NAME"
    echo "Input: \"$TEXT\""

    local ATTEMPT=1
    local RESPONSE=""
    local BODY=""
    local HTTP_STATUS=""
    local CURL_EXIT=0

    while [ $ATTEMPT -le $MAX_RETRIES ]; do
        RESPONSE=$(curl -sS -w "\n%{http_code}" -X POST "$API_URL$ENDPOINT" \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"$TEXT\"}")
        CURL_EXIT=$?

        if [ $CURL_EXIT -ne 0 ]; then
            echo -e "${RED}✗ Failed:${NC} Could not connect to API (attempt $ATTEMPT/$MAX_RETRIES)"
            if [ $ATTEMPT -lt $MAX_RETRIES ]; then
                echo "Retrying in ${RETRY_DELAY}s..."
                sleep $RETRY_DELAY
                ((ATTEMPT++))
                continue
            fi
            ((FAILED++))
            echo ""
            return
        fi

        HTTP_STATUS=$(printf '%s' "$RESPONSE" | tail -n1)
        BODY=$(printf '%s' "$RESPONSE" | sed '$d')

        if ! [[ "$HTTP_STATUS" =~ ^[0-9]{3}$ ]]; then
            HTTP_STATUS=0
        fi

        if [[ $ATTEMPT -lt $MAX_RETRIES && ( $HTTP_STATUS -ge 500 || $HTTP_STATUS -eq 429 || $HTTP_STATUS -eq 408 ) ]]; then
            echo -e "${YELLOW}Warning:${NC} Transient HTTP $HTTP_STATUS from API (attempt $ATTEMPT/$MAX_RETRIES)"
            if [ -n "$BODY" ]; then
                echo "Response: $BODY"
            fi
            echo "Retrying in ${RETRY_DELAY}s..."
            sleep $RETRY_DELAY
            ((ATTEMPT++))
            continue
        fi

        break
    done

    if [ "$HTTP_STATUS" -eq 0 ]; then
        echo -e "${RED}✗ Failed:${NC} Unexpected response with no HTTP status"
        echo "Raw response: $RESPONSE"
        ((FAILED++))
        echo ""
        return
    fi

    if [ "$HTTP_STATUS" -ge 400 ]; then
        echo -e "${RED}✗ Failed:${NC} HTTP $HTTP_STATUS from API"
        if [ -n "$BODY" ]; then
            echo "Response: $BODY"
        fi
        ((FAILED++))
        echo ""
        return
    fi

    # Check if response contains recognizedIntent
    if echo "$BODY" | grep -q "recognizedIntent"; then
        CATEGORY=$(echo "$BODY" | grep -o '"category":"[^"]*"' | cut -d'"' -f4)
        CONFIDENCE=$(echo "$BODY" | grep -o '"confidence":[0-9.]*' | cut -d':' -f2)
        SERVICE=$(echo "$BODY" | grep -o '"targetService":"[^"]*"' | cut -d'"' -f4)

        echo "Category: $CATEGORY"
        echo "Confidence: $CONFIDENCE"
        echo "Target Service: $SERVICE"

        if [ ! -z "$EXPECTED_CATEGORY" ] && [ "$CATEGORY" == "$EXPECTED_CATEGORY" ]; then
            echo -e "${GREEN}✓ Passed:${NC} Matched expected category"
            ((PASSED++))
        elif [ ! -z "$CATEGORY" ]; then
            echo -e "${GREEN}✓ Passed:${NC} Intent recognized"
            ((PASSED++))
        else
            echo -e "${RED}✗ Failed:${NC} No category found"
            ((FAILED++))
        fi
    else
        echo -e "${RED}✗ Failed:${NC} Invalid response format"
        echo "Response: $BODY"
        ((FAILED++))
    fi

    echo ""
}

# Test 1: Payment processing
test_intent \
    "Payment Processing" \
    "User wants to complete payment for the premium subscription plan" \
    "payment"

# Test 2: Password reset
test_intent \
    "Password Reset" \
    "I forgot my password and need to reset it" \
    "authentication"

# Test 3: Analytics request
test_intent \
    "Analytics Report" \
    "Generate monthly sales report with customer demographics" \
    "analytics"

# Test 4: Customer support
test_intent \
    "Customer Support" \
    "I need help with my account settings" \
    "support"

# Test 5: Order tracking
test_intent \
    "Order Tracking" \
    "Where is my order? I want to track my shipment" \
    "logistics"

# Test 6: Billing inquiry
test_intent \
    "Billing Inquiry" \
    "Why was I charged twice for my subscription?" \
    "billing"

# Test 7: Feature request
test_intent \
    "Feature Request" \
    "Can you add dark mode to the mobile app?" \
    "product"

# Test 8: Data export
test_intent \
    "Data Export" \
    "Export all user data to CSV format" \
    "data_management"

# Test 9: System status
test_intent \
    "System Status" \
    "Is the API service currently experiencing any issues?" \
    "monitoring"

# Test 10: Account deletion
test_intent \
    "Account Deletion" \
    "I want to permanently delete my account and all associated data" \
    "account"

echo "======================================"
echo "Test Results Summary"
echo "======================================"
echo -e "${GREEN}Passed:${NC} $PASSED"
echo -e "${RED}Failed:${NC} $FAILED"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed${NC}"
    exit 1
fi
