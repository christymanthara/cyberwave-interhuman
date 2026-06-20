import { API_KEY } from './constants.js';

const API_BASE = 'https://api.interhuman.ai';

export async function uploadAndAnalyze(file) {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('include[]', 'conversation_quality_overall');
  form.append('include[]', 'conversation_quality_timeline');

  const controller = new AbortController();

  const res = await fetch(API_BASE + '/v1/upload/analyze', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + API_KEY },
    body: form,
    signal: controller.signal
  });
  return res.json();
}

export async function runUpload(file) {
  return uploadAndAnalyze(file);
}