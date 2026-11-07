import assert from 'node:assert/strict';
import { test } from 'node:test';
import { identityFor, resolveVariant } from './appVariant.ts';

test('only the exact word production selects production', () => {
  assert.equal(resolveVariant('production'), 'production');
  assert.equal(resolveVariant(undefined), 'development');
  assert.equal(resolveVariant(''), 'development');
  assert.equal(resolveVariant('prod'), 'development');
  assert.equal(resolveVariant('Production'), 'development');
});

test('development and production never share an app id or scheme', () => {
  const dev = identityFor('development');
  const prod = identityFor('production');
  assert.notEqual(dev.androidPackage, prod.androidPackage);
  assert.notEqual(dev.iosBundleId, prod.iosBundleId);
  assert.notEqual(dev.scheme, prod.scheme);
  assert.notEqual(dev.name, prod.name);
});

test('production keeps the published ids', () => {
  const prod = identityFor('production');
  assert.equal(prod.androidPackage, 'pk.dhaworks.worker');
  assert.equal(prod.iosBundleId, 'pk.dhaworks.worker');
  assert.equal(prod.name, 'DHA Works Worker');
});
