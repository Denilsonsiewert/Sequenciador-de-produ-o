// js/api.js - Cliente da API Google Apps Script (Versão Corrigida e Otimizada)

const API_CONFIG = {
  // URL da sua API do Google Apps Script
  URL: "https://script.google.com/macros/s/AKfycbyi5Y_G68bnQ1SOOpE6IkbRQueRmyDEUv2RhvCHQbFAdxCG8rfNs0CqCYA319eDgD9J/exec",
  
  // Senha definida no Apps Script
  SECRET: "16101961",
  
  // Intervalo de polling em milissegundos
  POLLING_INTERVAL: 5000
};

// Estado local (Removido o localCache duplicado para evitar conflitos com o State.data do HTML)
let lastSyncTimestamp = 0;
let syncInProgress = false;

// Sistema de eventos
const eventListeners = {};

/**
 * Função principal de comunicação com a API
 * Ajustada para evitar problemas de CORS "Preflight" e lidar com redirecionamentos do Google
 */
async function apiRequest(action, payload = {}, method = 'POST') {
  try {
    const url = new URL(API_CONFIG.URL);
    
    // Sempre passamos a ação na URL para facilitar o roteamento no backend
    url.searchParams.append('action', action);
    
    const options = {
      method: method,
      mode: 'cors',
      redirect: 'follow'
    };

    if (method === 'POST') {
      // Não incluímos headers customizados para evitar requisições OPTIONS (Preflight)
      options.body = JSON.stringify({ 
        action, 
        secret: API_CONFIG.SECRET,
        ...payload 
      });
    } else if (method === 'GET') {
      if (payload.since) url.searchParams.append('since', payload.since);
      if (payload.key) url.searchParams.append('key', payload.key);
      url.searchParams.append('secret', API_CONFIG.SECRET);
    }
    
    const response = await fetch(url.toString(), options);
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Erro na API');
    }
    
    return result;
  } catch (error) {
    console.error('API Request failed:', error);
    throw error;
  }
}

// Operações CRUD (Agora apenas disparam eventos, sem manter cache próprio)
async function createProject(projectData) {
  const result = await apiRequest('create', { data: projectData });
  triggerEvent('project:created', { ...projectData, ID: result.id, AtualizadoEm: Date.now() });
  return result;
}

async function updateProject(projectData) {
  const result = await apiRequest('update', { data: projectData });
  triggerEvent('project:updated', { ...projectData, AtualizadoEm: Date.now() });
  return result;
}

async function deleteProject(projectId) {
  const result = await apiRequest('delete', { id: projectId });
  triggerEvent('project:deleted', projectId);
  return result;
}

async function updateConfig(key, value) {
  return await apiRequest('updateConfig', { key, value });
}

async function getConfig(key) {
  const result = await apiRequest('getConfig', { key }, 'GET');
  return result.value;
}

// Sincronização (Agora apenas dispara eventos para o HTML processar)
async function syncData() {
  if (syncInProgress) return;
  syncInProgress = true;
  
  try {
    const result = await apiRequest('sync', { since: lastSyncTimestamp }, 'GET');
    
    if (result.success && result.data) {
      result.data.forEach(remoteProj => {
        // Dispara um evento genérico de sync para cada projeto
        triggerEvent('project:synced', remoteProj);
      });
      
      lastSyncTimestamp = result.timestamp;
      triggerEvent('sync:complete', { count: result.data.length });
    }
    
  } catch (error) {
    console.error('Sync failed:', error);
    triggerEvent('sync:error', error);
  } finally {
    syncInProgress = false;
  }
}

function startPolling(interval = API_CONFIG.POLLING_INTERVAL) {
  syncData();
  const timer = setInterval(syncData, interval);
  console.log(`Polling iniciado: ${interval}ms`);
  return timer;
}

// Sistema de eventos
function on(event, callback) {
  if (!eventListeners[event]) eventListeners[event] = [];
  eventListeners[event].push(callback);
}

function off(event, callback) {
  if (eventListeners[event]) {
    eventListeners[event] = eventListeners[event].filter(cb => cb !== callback);
  }
}

function triggerEvent(event, data) {
  if (eventListeners[event]) {
    eventListeners[event].forEach(callback => {
      try {
        callback(data);
      } catch (e) {
        console.error(`Error in event listener for ${event}:`, e);
      }
    });
  }
}

// Exportar API globalmente
window.API = {
  createProject,
  updateProject,
  deleteProject,
  updateConfig,
  getConfig,
  syncData,
  startPolling,
  on,
  off
};

// NOTA: Removido o startPolling() automático do final do script.
// O HTML principal (index.html) agora controla quando iniciar o polling.
