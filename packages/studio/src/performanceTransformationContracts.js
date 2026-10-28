// Intent metadata only. Wire contracts remain owned by Recast/Motion Control.
export function getPerformanceTransformation(model, route, parameters = {}) {
  const motion = route === 'motion_control';
  const recast = route === 'recast';
  if (!motion && !recast) return null;
  const replacement = motion ? parameters.mode === 'objects_swap' : model.family === 'wan2.2' && parameters.mode === 'replace';
  const selectors = motion ? { PERFORMANCE_TRANSFER: { mode: 'motion_transfer' }, OBJECT_REPLACE_VIDEO: { mode: 'objects_swap' } }
    : model.family === 'wan2.2' ? { PERFORMANCE_TRANSFER: { mode: 'animate' }, OBJECT_REPLACE_VIDEO: { mode: 'replace' } }
      : { PERFORMANCE_TRANSFER: {} };
  return { capability: replacement ? 'OBJECT_REPLACE_VIDEO' : 'PERFORMANCE_TRANSFER', selectors,
    path: motion ? 'managed_provider_preprocessing' : 'direct_performance_transfer',
    guidance: { acceptedModes: ['raw'], preparedGuidanceSupported: false, code: 'GUIDANCE_INPUT_CONTRACT_UNSUPPORTED' },
    preservation: { evidence: 'provider_intent_not_measured_guarantee', independentlyVerified: false },
    referenceImages: { minimum: 1, maximum: motion ? model.maxImages : 1 },
    ...(motion ? { duration: { minimum: model.minDuration, maximum: model.maxDuration }, outputResolution: model.transformationOutputResolution ?? null } : {}),
    audio: motion ? 'generate_audio_control_not_soundtrack_identity' : model.family === 'kling' ? 'keep_original_sound_control' : 'not_guaranteed',
    variant: motion && model.endpoint.includes('-spicy-') ? 'provider_declared_bolder_creative_treatment_not_fidelity_verified' : 'standard',
    limitations: model.family === 'runway' ? ['Performance/facial driving route; no general object replacement or source-scene preservation guarantee.'] : [],
    sourceAudioRestoration: 'explicit_separate_FINISH_MEDIA_restore_source_audio',
    providerCost: 'native_evidence_only_unknown_unless_reported' };
}
