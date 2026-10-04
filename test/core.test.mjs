import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRemaining, parseDelay, preview } from "../src/core.mjs";

test("parseDelay treats plain numbers as minutes", () => {
	assert.equal(parseDelay("5").ms, 5 * 60 * 1000);
	assert.equal(parseDelay("1.5").ms, 90 * 1000);
});

test("parseDelay supports explicit units and cancel words", () => {
	assert.equal(parseDelay("90s").ms, 90 * 1000);
	assert.equal(parseDelay("2m").ms, 2 * 60 * 1000);
	assert.equal(parseDelay("cancel").cancel, true);
});

test("parseDelay rejects garbage and out-of-range values", () => {
	assert.equal(parseDelay("").ok, false);
	assert.equal(parseDelay("abc").ok, false);
	assert.equal(parseDelay("0").ok, false);
	assert.equal(parseDelay("-3").ok, false);
	assert.equal(parseDelay("500").ok, false);
});

test("formatRemaining renders M:SS and H:MM:SS", () => {
	assert.equal(formatRemaining(5 * 60 * 1000), "5:00");
	assert.equal(formatRemaining(90 * 1000), "1:30");
	assert.equal(formatRemaining(65 * 60 * 1000), "1:05:00");
});

test("preview stays single-line and bounded", () => {
	assert.equal(preview("hello"), "hello");
	assert.equal(preview("a\nb"), "a");
	assert.ok(preview("x".repeat(200)).length <= 80);
});
