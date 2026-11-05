import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_VOICE_MS, VOICE_BIT_RATE, VOICE_CHANNELS, VOICE_SAMPLE_RATE, estimateVoiceBytes } from '../work/rules.ts';
import { IMAGE_PROFILES, MAX_FILE_BYTES, fitWithin, imageKindFor } from './files.ts';

test('compression gets harder as the picture matters less', () => {
  const { document, evidence, avatar } = IMAGE_PROFILES;
  assert.equal(document.maxEdge, 1600);
  assert.equal(document.quality, 0.7);
  assert.ok(evidence.maxEdge < document.maxEdge);
  assert.ok(evidence.quality < document.quality);
  assert.ok(avatar.maxEdge < evidence.maxEdge);
});

test('CNIC and certificate stay sharp, only the profile picture is shrunk to avatar size', () => {
  assert.equal(imageKindFor('cnic_front'), 'document');
  assert.equal(imageKindFor('cnic_back'), 'document');
  assert.equal(imageKindFor('police_cert'), 'document');
  assert.equal(imageKindFor('profile_photo'), 'avatar');
});

test('a 12 megapixel phone photo is scaled to each profile and small images are left alone', () => {
  assert.deepEqual(fitWithin(4032, 3024, IMAGE_PROFILES.evidence.maxEdge), { width: 1280, height: 960 });
  assert.deepEqual(fitWithin(3024, 4032, IMAGE_PROFILES.evidence.maxEdge), { width: 960, height: 1280 });
  assert.deepEqual(fitWithin(1000, 1000, IMAGE_PROFILES.avatar.maxEdge), { width: 512, height: 512 });
  assert.equal(fitWithin(400, 300, IMAGE_PROFILES.avatar.maxEdge), null);
});

test('voice is mono speech quality: about a quarter of the old size and far below the file limit', () => {
  assert.equal(VOICE_CHANNELS, 1);
  assert.equal(VOICE_SAMPLE_RATE, 16_000);
  assert.equal(VOICE_BIT_RATE, 32_000);
  const oldHighQuality = (128_000 / 8) * (MAX_VOICE_MS / 1000);
  assert.equal(estimateVoiceBytes(MAX_VOICE_MS), 120_000);
  assert.ok(estimateVoiceBytes(MAX_VOICE_MS) <= oldHighQuality / 3);
  assert.ok(estimateVoiceBytes(MAX_VOICE_MS) < MAX_FILE_BYTES / 20);
  assert.equal(estimateVoiceBytes(0), 0);
});
