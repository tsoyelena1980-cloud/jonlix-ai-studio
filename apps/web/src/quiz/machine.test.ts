import { describe, expect, it } from 'vitest';
import { advance, back, freshState, needsExtraText, openAtService, patchAnswers, questionIndex, selectService } from './machine.js';

describe('quiz machine', () => {
  it('ведёт фото-ветку и возвращает назад с ответом', () => {
    let state = selectService(freshState('8c1c7a2e-1d4b-4e5a-9c1f-0a0b0c0d0e0f'), 'photo');
    state = advance(state);
    expect(state.stepId).toBe('photo_count');
    expect(questionIndex(state)).toBe(2);
    state = patchAnswers(state, { photo_count: '2-3' });
    state = advance(state);
    state = back(state);
    expect(state.stepId).toBe('photo_count');
    expect(state.answers.photo_count).toBe('2-3');
  });

  it('открытие с карточки начинает со второго вопроса', () => {
    const state = openAtService(freshState('8c1c7a2e-1d4b-4e5a-9c1f-0a0b0c0d0e0f'), 'video');
    expect(state.stepId).toBe('video_occasion');
    expect(state.history).toEqual(['service']);
    expect(questionIndex(state)).toBe(2);
  });

  it('смена услуги очищает чужие ответы', () => {
    let state = patchAnswers(selectService(freshState('8c1c7a2e-1d4b-4e5a-9c1f-0a0b0c0d0e0f'), 'photo'), {
      photo_count: '1',
    });
    state = selectService(state, 'landing');
    expect(state.answers.photo_count).toBeUndefined();
    expect(state.service).toBe('landing');
  });

  it('просит текст, если выбран пункт «другое»', () => {
    const state = patchAnswers(selectService(freshState('8c1c7a2e-1d4b-4e5a-9c1f-0a0b0c0d0e0f'), 'other'), {});
    const onService = { ...state, stepId: 'service' as const };
    expect(needsExtraText(onService)).toBe(true);
  });
});
