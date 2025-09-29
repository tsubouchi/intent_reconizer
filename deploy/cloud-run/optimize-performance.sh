#!/bin/bash

# Cloud Run Performance Optimization Script
# This script optimizes the Cloud Run service for better performance

set -e

PROJECT_ID="agi-egg-production"
REGION="us-central1"
SERVICE_NAME="agi-egg-isr-router"

echo "==========================================="
echo "Cloud Run Performance Optimization"
echo "==========================================="
echo ""
echo "Service: $SERVICE_NAME"
echo "Region: $REGION"
echo ""

# Check if user is authenticated
echo "Checking GCP authentication..."
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &>/dev/null; then
    echo "❌ Not authenticated. Please run: gcloud auth login"
    exit 1
fi

echo "✅ Authenticated as: $(gcloud auth list --filter=status:ACTIVE --format='value(account)')"
echo ""

# Set project
echo "Setting project to $PROJECT_ID..."
gcloud config set project $PROJECT_ID

echo ""
echo "Current Configuration:"
echo "======================"
gcloud run services describe $SERVICE_NAME --region=$REGION --format="table(
  spec.template.spec.containers[0].resources.limits.cpu:label='CPU',
  spec.template.spec.containers[0].resources.limits.memory:label='Memory',
  spec.template.metadata.annotations.'autoscaling.knative.dev/minScale':label='Min Instances',
  spec.template.metadata.annotations.'autoscaling.knative.dev/maxScale':label='Max Instances'
)"

echo ""
echo "Applying Performance Optimizations..."
echo "======================================"

# 1. Increase minimum instances to avoid cold starts
echo "1. Setting minimum instances to 1 (warm instance)..."
gcloud run services update $SERVICE_NAME \
    --region=$REGION \
    --min-instances=1 \
    --max-instances=100 \
    --no-traffic

# 2. Increase CPU and memory for better performance
echo "2. Upgrading CPU and memory resources..."
gcloud run services update $SERVICE_NAME \
    --region=$REGION \
    --cpu=2 \
    --memory=2Gi \
    --no-traffic

# 3. Set concurrency for optimal performance
echo "3. Optimizing concurrency settings..."
gcloud run services update $SERVICE_NAME \
    --region=$REGION \
    --concurrency=100 \
    --no-traffic

# 4. Enable CPU boost for faster startup
echo "4. Enabling startup CPU boost..."
gcloud run services update $SERVICE_NAME \
    --region=$REGION \
    --cpu-boost \
    --no-traffic

# 5. Set request timeout
echo "5. Setting request timeout to 60 seconds..."
gcloud run services update $SERVICE_NAME \
    --region=$REGION \
    --timeout=60 \
    --no-traffic

# 6. Enable HTTP/2 for better performance
echo "6. Enabling HTTP/2 end-to-end..."
gcloud run services update $SERVICE_NAME \
    --region=$REGION \
    --use-http2 \
    --no-traffic

# Deploy the changes with traffic
echo ""
echo "Deploying optimizations with traffic migration..."
gcloud run services update-traffic $SERVICE_NAME \
    --region=$REGION \
    --to-latest

echo ""
echo "======================================"
echo "✅ Optimizations Applied Successfully!"
echo "======================================"
echo ""
echo "New Configuration:"
echo "=================="
gcloud run services describe $SERVICE_NAME --region=$REGION --format="table(
  spec.template.spec.containers[0].resources.limits.cpu:label='CPU',
  spec.template.spec.containers[0].resources.limits.memory:label='Memory',
  spec.template.metadata.annotations.'autoscaling.knative.dev/minScale':label='Min Instances',
  spec.template.metadata.annotations.'autoscaling.knative.dev/maxScale':label='Max Instances'
)"

echo ""
echo "Service URL:"
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)')
echo "$SERVICE_URL"

echo ""
echo "Performance Improvements Applied:"
echo "================================="
echo "✅ Min instances: 1 (prevents cold starts)"
echo "✅ Max instances: 100 (handles traffic spikes)"
echo "✅ CPU: 2 cores"
echo "✅ Memory: 2Gi"
echo "✅ Concurrency: 100 requests per instance"
echo "✅ CPU boost: Enabled (faster startup)"
echo "✅ Timeout: 60 seconds"
echo "✅ HTTP/2: Enabled"
echo ""
echo "Note: It may take a few minutes for the changes to fully propagate."
echo ""
echo "Test the performance with:"
echo "  curl -w \"@-\" -o /dev/null -s \"$SERVICE_URL/health\" <<EOF"
echo "  time_namelookup:  %{time_namelookup}s\\n"
echo "  time_connect:  %{time_connect}s\\n"
echo "  time_appconnect:  %{time_appconnect}s\\n"
echo "  time_pretransfer:  %{time_pretransfer}s\\n"
echo "  time_redirect:  %{time_redirect}s\\n"
echo "  time_starttransfer:  %{time_starttransfer}s\\n"
echo "  time_total:  %{time_total}s\\n"
echo "EOF"