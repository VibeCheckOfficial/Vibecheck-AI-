# CLI Performance Profiling Guide

**Purpose:** Define performance targets, measurement methodology, and optimization strategies for the VibeCheck CLI.

---

## Performance Targets

### Scan Command

| Metric | Target | Current | Measurement Method |
|--------|--------|---------|-------------------|
| **First Run** (10k files) | < 30s | TBD | `time vibecheck scan` |
| **Second Run** (incremental) | < 5s (80%+ faster) | TBD | `time vibecheck scan` |
| **Memory Usage** | < 500MB | TBD | `node --max-old-space-size=512` |
| **Cache Hit Rate** | > 70% | TBD | Cache stats in verbose mode |
| **File I/O Concurrency** | CPU count × 2 | TBD | Monitor file descriptors |

### Validate Command

| Metric | Target | Current | Measurement Method |
|--------|--------|---------|-------------------|
| **Single File** | < 100ms | TBD | `time vibecheck validate <file>` |
| **100 Files** | < 5s | TBD | `time vibecheck validate src/**/*.ts` |
| **Memory Usage** | < 200MB | TBD | Process memory monitoring |

### Check Command

| Metric | Target | Current | Measurement Method |
|--------|--------|---------|-------------------|
| **Full Check** | < 10s | TBD | `time vibecheck check` |
| **Memory Usage** | < 300MB | TBD | Process memory monitoring |

---

## Measurement Methodology

### 1. Baseline Measurement

```bash
# Measure first run (cold cache)
time vibecheck scan --json > /dev/null

# Measure second run (warm cache)
time vibecheck scan --json > /dev/null

# Compare results
echo "First run: $(cat first-run.log | jq '.duration')ms"
echo "Second run: $(cat second-run.log | jq '.duration')ms"
```

### 2. Memory Profiling

```bash
# Using Node.js built-in profiler
node --max-old-space-size=512 --prof vibecheck scan

# Analyze with cli
node --prof-process isolate-*.log > profile.txt

# Or use clinic.js
npx clinic doctor -- vibecheck scan
```

### 3. Cache Effectiveness

```bash
# Run with verbose to see cache stats
vibecheck scan --verbose 2>&1 | grep -i cache

# Expected output:
# Cache hits: 7500
# Cache misses: 2500
# Hit rate: 75%
```

### 4. File I/O Monitoring

```bash
# Monitor file descriptors (Linux/macOS)
lsof -p $(pgrep -f vibecheck) | wc -l

# Monitor I/O wait (Linux)
iostat -x 1

# Monitor disk I/O (macOS)
sudo fs_usage -f diskio -w | grep vibecheck
```

### 5. Concurrency Analysis

```bash
# Enable debug mode to see concurrency stats
VIBECHECK_DEBUG=1 vibecheck scan 2>&1 | grep -i "concurrency\|parallel"

# Expected output:
# Processing 1000 files with concurrency limit: 16
# Completed batch 1/63 (16 files) in 234ms
```

---

## Profiling Tools

### Node.js Built-in Profiler

```bash
# Generate CPU profile
node --cpu-prof vibecheck scan

# Generate heap snapshot
node --heapsnapshot-signal=SIGUSR2 vibecheck scan
# In another terminal: kill -USR2 <pid>

# Analyze with Chrome DevTools
# Open chrome://inspect, click "Open dedicated DevTools for Node"
```

### Clinic.js

```bash
# Install
npm install -g clinic

# Doctor (CPU profiling)
clinic doctor -- vibecheck scan

# Bubbleprof (async profiling)
clinic bubbleprof -- vibecheck scan

# Flame (flamegraph)
clinic flame -- vibecheck scan
```

### 0x (Flamegraph)

```bash
# Install
npm install -g 0x

# Generate flamegraph
0x vibecheck scan

# Opens interactive HTML flamegraph
```

### AutoCannon (Load Testing)

```bash
# Install
npm install -g autocannon

# Test API endpoints (if applicable)
autocannon -c 10 -d 30 http://localhost:3001/api/scans
```

---

## Performance Benchmarks

### Test Repositories

1. **Small** (< 100 files)
   - Target: < 2s first run, < 500ms second run
   - Example: `vibecheck init` in empty directory

2. **Medium** (1k-5k files)
   - Target: < 15s first run, < 3s second run
   - Example: Typical Next.js project

3. **Large** (10k+ files)
   - Target: < 30s first run, < 5s second run
   - Example: Monorepo with multiple packages

### Benchmark Script

```bash
#!/bin/bash
# benchmark.sh

REPO_SIZE=$1
ITERATIONS=3

echo "Benchmarking VibeCheck CLI..."
echo "Repository size: $REPO_SIZE files"
echo "Iterations: $ITERATIONS"
echo ""

# Clear cache
rm -rf node_modules/.cache/vibecheck
rm -rf .vibecheck/truthpack

# First run (cold cache)
echo "=== First Run (Cold Cache) ==="
FIRST_RUN_TIMES=()
for i in $(seq 1 $ITERATIONS); do
  TIME=$(time (vibecheck scan --json > /dev/null) 2>&1 | grep real | awk '{print $2}')
  FIRST_RUN_TIMES+=($TIME)
  echo "Run $i: $TIME"
done

# Calculate average
AVG_FIRST=$(echo "${FIRST_RUN_TIMES[@]}" | awk '{sum=0; for(i=1;i<=NF;i++) sum+=$i; print sum/NF}')
echo "Average: $AVG_FIRST"
echo ""

# Second run (warm cache)
echo "=== Second Run (Warm Cache) ==="
SECOND_RUN_TIMES=()
for i in $(seq 1 $ITERATIONS); do
  TIME=$(time (vibecheck scan --json > /dev/null) 2>&1 | grep real | awk '{print $2}')
  SECOND_RUN_TIMES+=($TIME)
  echo "Run $i: $TIME"
done

# Calculate average
AVG_SECOND=$(echo "${SECOND_RUN_TIMES[@]}" | awk '{sum=0; for(i=1;i<=NF;i++) sum+=$i; print sum/NF}')
echo "Average: $AVG_SECOND"
echo ""

# Calculate speedup
SPEEDUP=$(echo "scale=2; $AVG_FIRST / $AVG_SECOND" | bc)
echo "Speedup: ${SPEEDUP}x"
echo "Cache effectiveness: $(echo "scale=1; (1 - $AVG_SECOND / $AVG_FIRST) * 100" | bc)%"
```

---

## Optimization Strategies

### 1. Incremental Scanning

**Target:** Only scan changed files based on mtime/content hash

**Measurement:**
```bash
# First run
vibecheck scan --verbose 2>&1 | grep "files scanned"

# Modify one file
touch src/index.ts

# Second run
vibecheck scan --verbose 2>&1 | grep "files scanned"
# Should show only 1 file scanned (or few files)
```

**Implementation:** See `packages/core/src/cache/index.ts` - already has dependency tracking

### 2. Parallel File Processing

**Target:** Process files with concurrency limit = CPU count × 2

**Measurement:**
```bash
# Check concurrency usage
VIBECHECK_DEBUG=1 vibecheck scan 2>&1 | grep "concurrency"

# Monitor CPU usage
top -p $(pgrep -f vibecheck)
# Should show ~100% CPU utilization (all cores)
```

**Implementation:** Fixed in `packages/core/src/utils/performance.ts` - `parallelLimit`

### 3. Memory Optimization

**Target:** < 500MB memory usage for large repos

**Measurement:**
```bash
# Monitor memory
node --max-old-space-size=512 vibecheck scan

# Or use process monitor
watch -n 1 'ps aux | grep vibecheck | awk "{print \$6/1024\"MB\"}"'
```

**Strategies:**
- Stream large files instead of loading into memory
- Use generators for file processing
- Clear caches periodically

### 4. Cache Optimization

**Target:** > 70% cache hit rate on second run

**Measurement:**
```bash
vibecheck scan --verbose 2>&1 | grep -i "cache\|hit\|miss"
```

**Strategies:**
- Cache file content hashes
- Cache scan results per file
- Invalidate only changed files

### 5. I/O Optimization

**Target:** Minimize disk I/O, maximize cache usage

**Measurement:**
```bash
# Monitor I/O (Linux)
iostat -x 1 | grep -A 5 "Device"

# Monitor I/O (macOS)
sudo fs_usage -f diskio -w | grep vibecheck
```

**Strategies:**
- Batch file reads
- Use readdir with stats in one call
- Minimize file system calls

---

## Continuous Performance Monitoring

### CI/CD Integration

Add to `.github/workflows/ci.yml`:

```yaml
- name: Performance Benchmark
  run: |
    ./scripts/benchmark.sh medium
    # Fail if performance regressed > 20%
```

### Performance Regression Detection

```bash
# Compare against baseline
BASELINE_FIRST=15.2
BASELINE_SECOND=2.8

CURRENT_FIRST=$(vibecheck scan --json 2>&1 | jq '.duration' | awk '{print $1/1000}')
CURRENT_SECOND=$(vibecheck scan --json 2>&1 | jq '.duration' | awk '{print $1/1000}')

# Check regression
if (( $(echo "$CURRENT_FIRST > $BASELINE_FIRST * 1.2" | bc -l) )); then
  echo "Performance regression detected!"
  exit 1
fi
```

---

## Profiling Workflow

1. **Identify Bottleneck**
   ```bash
   clinic doctor -- vibecheck scan
   ```

2. **Deep Dive**
   ```bash
   0x vibecheck scan
   ```

3. **Fix Issue**
   - Make targeted optimization
   - Add timing instrumentation

4. **Verify Improvement**
   ```bash
   ./scripts/benchmark.sh large
   ```

5. **Document**
   - Update this file with new baseline
   - Add to CHANGELOG

---

## Performance Budget

| Operation | Budget | Notes |
|-----------|--------|-------|
| File read | < 1ms | Cached after first read |
| File parse | < 10ms | Depends on file size |
| Route extraction | < 5ms | Per file |
| Truthpack generation | < 100ms | Total for all files |
| Cache lookup | < 0.1ms | In-memory lookup |
| Disk cache read | < 5ms | Per file |

---

## Troubleshooting Performance Issues

### Slow First Run

1. Check file count: `find . -type f | wc -l`
2. Check concurrency: `VIBECHECK_DEBUG=1 vibecheck scan`
3. Profile: `clinic doctor -- vibecheck scan`

### Slow Second Run

1. Check cache hit rate: `vibecheck scan --verbose`
2. Check cache size: `du -sh node_modules/.cache/vibecheck`
3. Verify incremental scanning is working

### High Memory Usage

1. Check file sizes: `find . -type f -size +1M`
2. Profile heap: `node --heapsnapshot-signal=SIGUSR2 vibecheck scan`
3. Check for memory leaks: `clinic doctor -- vibecheck scan`

### High CPU Usage

1. Check concurrency limit: Should be CPU count × 2
2. Profile CPU: `clinic doctor -- vibecheck scan`
3. Check for blocking operations

---

## Next Steps

1. ✅ Establish baseline measurements
2. ✅ Set up CI/CD performance monitoring
3. ✅ Create benchmark suite
4. ⏳ Implement incremental scanning
5. ⏳ Optimize cache hit rates
6. ⏳ Add performance regression tests

---

**Last Updated:** 2026-01-29  
**Maintainer:** Performance Team
