import type { ProcessMiningState, MiningPreprocessingRecipe, SavedPreprocessingRecipe } from '../domain/process';

export function listPreprocessingRecipes(pm?: ProcessMiningState): SavedPreprocessingRecipe[] {
  return pm?.preprocessingRecipes ?? [];
}

export function getPreprocessingRecipe(pm: ProcessMiningState, id: string): SavedPreprocessingRecipe | undefined {
  return (pm.preprocessingRecipes ?? []).find(r => r.id === id);
}

export function upsertPreprocessingRecipe(pm: ProcessMiningState, params: {
  id?: string;
  name: string;
  recipe: MiningPreprocessingRecipe;
  nowIso?: string;
}): ProcessMiningState {
  const now = params.nowIso ?? new Date().toISOString();
  const name = params.name.trim();
  const list = pm.preprocessingRecipes ?? [];
  if (!name) return pm;

  if (params.id) {
    const next = list.map(r => r.id === params.id ? { ...r, name, recipe: params.recipe, updatedAt: now } : r);
    return { ...pm, preprocessingRecipes: next };
  }

  const created: SavedPreprocessingRecipe = {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    recipe: params.recipe,
  };
  return { ...pm, preprocessingRecipes: [...list, created] };
}

export function removePreprocessingRecipe(pm: ProcessMiningState, id: string): ProcessMiningState {
  const list = pm.preprocessingRecipes ?? [];
  return { ...pm, preprocessingRecipes: list.filter(r => r.id !== id) };
}
