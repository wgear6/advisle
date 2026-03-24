#!/bin/bash
# Weekly auto-rescrape of UVM Fall 2026 SOC
# Runs the scraper, commits if anything changed, and pushes to trigger Vercel redeploy

set -e

cd /Users/williamgear/degree-scheduler

echo "[rescrape] Starting UVM SOC scrape at $(date)"
node scrape-uvm-courses.mjs

# Only commit if the CSV actually changed
if git diff --quiet data/curr_enroll_fall.csv; then
  echo "[rescrape] No changes in SOC data, skipping commit"
else
  SECTIONS=$(grep -c '"LEC"' data/curr_enroll_fall.csv || true)
  git add data/curr_enroll_fall.csv
  git commit -m "auto-rescrape: $(date +%Y-%m-%d) — ${SECTIONS} LEC sections

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  git push
  echo "[rescrape] Pushed updated SOC ($SECTIONS LEC sections)"
fi

echo "[rescrape] Done at $(date)"
