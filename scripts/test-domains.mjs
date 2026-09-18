// Domain matching and categorisation tests. Run with `npm test`.
import assert from "node:assert/strict";
import {
  domainMatches,
  getBaseCategory,
  getDomainCategory,
  isAllowedDomain,
  isExcludedDomain,
  normalizeDomain
} from "../src/lib/domains.js";

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failures.push({ name, error });
  }
}

// --- domainMatches: exact or subdomain, never substring --------------------
test("netflix.com does not match x.com", () => assert.equal(domainMatches("netflix.com", "x.com"), false));
test("dropbox.com does not match x.com", () => assert.equal(domainMatches("dropbox.com", "x.com"), false));
test("linux.com does not match x.com", () => assert.equal(domainMatches("linux.com", "x.com"), false));
test("x.com matches x.com", () => assert.equal(domainMatches("x.com", "x.com"), true));
test("www.x.com matches x.com", () => assert.equal(domainMatches("www.x.com", "x.com"), true));
test("mobile.x.com matches x.com", () => assert.equal(domainMatches("mobile.x.com", "x.com"), true));
test("m.youtube.com matches youtube.com", () => assert.equal(domainMatches("m.youtube.com", "youtube.com"), true));
test("youtube.com does not match m.youtube.com", () => assert.equal(domainMatches("youtube.com", "m.youtube.com"), false));
test("notyoutube.com does not match youtube.com", () => assert.equal(domainMatches("notyoutube.com", "youtube.com"), false));
test("URLs and case are normalised", () => assert.equal(domainMatches("HTTPS://WWW.Reddit.com/r/x", "reddit.com"), true));
test("trailing dot is ignored", () => assert.equal(domainMatches("reddit.com.", "reddit.com"), true));
test("empty values never match", () => {
  assert.equal(domainMatches("", "x.com"), false);
  assert.equal(domainMatches("x.com", ""), false);
});

// --- Categories -------------------------------------------------------------
const expectations = [
  ["netflix.com", "distracting"],
  ["www.netflix.com", "distracting"],
  ["x.com", "ambiguous"],
  ["youtube.com", "ambiguous"],
  ["m.youtube.com", "ambiguous"],
  ["docs.google.com", "work"],
  ["mail.google.com", "communication"],
  ["github.com", "work"]
];
for (const [domain, category] of expectations) {
  test(`${domain} is ${category}`, () => assert.equal(getBaseCategory(domain), category));
}

test("dropbox.com is not distracting", () => assert.notEqual(getBaseCategory("dropbox.com"), "distracting"));
test("linux.com is not distracting", () => assert.notEqual(getBaseCategory("linux.com"), "distracting"));
test("console.aws.amazon.com is not distracting", () =>
  assert.notEqual(getBaseCategory("console.aws.amazon.com"), "distracting"));
test("jiraiya-fan.net is not work", () => assert.notEqual(getBaseCategory("jiraiya-fan.net"), "work"));

// --- Trust ("It's for work") is session-scoped -------------------------------
test("a trusted domain counts as work inside its session", () => {
  const session = { allowedDomains: ["youtube.com"] };
  assert.equal(getDomainCategory("m.youtube.com", session), "work");
});
test("trust does not leak into another session", () => {
  assert.equal(getDomainCategory("youtube.com", { allowedDomains: [] }), "ambiguous");
  assert.equal(getDomainCategory("youtube.com", null), "ambiguous");
});
test("trusting x.com does not trust netflix.com", () => {
  assert.equal(isAllowedDomain("netflix.com", ["x.com"]), false);
});

// --- Excluded domains --------------------------------------------------------
test("excluded list accepts a comma/newline string", () => {
  assert.equal(isExcludedDomain("bank.example.com", "example.com, other.org"), true);
  assert.equal(isExcludedDomain("notexample.com", "example.com\nother.org"), false);
});
test("normalizeDomain strips www and paths", () => assert.equal(normalizeDomain("www.Example.com/path"), "example.com"));

report("domains");

function report(label) {
  for (const { name, error } of failures) {
    console.error(`  FAIL ${name}\n       ${error.message.split("\n")[0]}`);
  }
  console.log(`${label}: ${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exitCode = 1;
}
