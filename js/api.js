// js/api.js - Cliente da API Google Apps Script (Corrigido para CORS e Redirecionamento)

const API_CONFIG = {
  // URL da sua API do Google Apps Script
  URL: "https://script.google.com/macros/s/AKfycbyi5Y_G68bnQ1SOOpE6IkbRQueRmyDEUv2RhvCHQbFAdxCG8rfNs0CqCYA319eDgD9J/exec",
  
  // Senha definida no Apps Script
  SECRET: "16101961",
  
  // Intervalo de polling em milissegundos
  POLLING_INTERVAL: 5000
};

// Estado local
let lastSyncTimestamp = 0;
let syncInProgress = false;
let localCache = {
  projetos: [],
  config: {}
};

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
      // NOTA: Não incluímos headers customizados como 'Authorization' ou 'Content-Type: application/json'
      // para evitar que o navegador envie uma requisição OPTIONS (Preflight), que o GAS não lida bem.
      // O GAS aceita o corpo da requisição mesmo sem o Content-Type explícito.
      options.body = JSON.stringify({ 
        action, 
        secret: API_CONFIG.SECRET, // Enviamos o segredo no corpo para validação
        ...payload 
      });
    } else if (method === 'GET') {
      // Para GET, adicionamos todos os parâmetros na URL
      if (payload.since) url.searchParams.append('since', payload.since);
      if (payload.key) url.searchParams.append('key', payload.key);
      // Adicionamos o segredo na URL para GET
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

// Operações CRUD
async function createProject(projectData) {
  const result = await apiRequest('create', { data: projectData });
  const newProject = { ...projectData, ID: result.id, AtualizadoEm: Date.now() };
  localCache.projetos.push(newProject);
  triggerEvent('project:created', newProject);
  return result;
}

async function updateProject(projectData) {
  const result = await apiRequest('update', { data: projectData });
  const index = localCache.projetos.findIndex(p => p.ID === projectData.ID);
  if (index !== -1) {
    localCache.projetos[index] = { ...localCache.projetos[index], ...projectData, AtualizadoEm: Date.now() };
    triggerEvent('project:updated', localCache.projetos[index]);
  }
  return result;
}

async function deleteProject(projectId) {
  const result = await apiRequest('delete', { id: projectId });
  localCache.projetos = localCache.projetos.filter(p => p.ID !== projectId);
  triggerEvent('project:deleted', projectId);
  return result;
}

async function updateConfig(key, value) {
  const result = await apiRequest('updateConfig', { key, value });
  localCache.config[key] = { value, updatedAt: Date.now() };
  return result;
}

async function getConfig(key) {
  const result = await apiRequest('getConfig', { key }, 'GET');
  localCache.config[key] = { value: result.value, updatedAt: Date.now() };
  return result.value;
}

// Sincronização
async function syncData() {
  if (syncInProgress) return;
  syncInProgress = true;
  
  try {
    const result = await apiRequest('sync', { since: lastSyncTimestamp }, 'GET');
    
    if (result.success && result.data) {
      result.data.forEach(remoteProj => {
        const localIndex = localCache.projetos.findIndex(p => p.ID === remoteProj.ID);
        
        if (localIndex === -1) {
          localCache.projetos.push(remoteProj);
          triggerEvent('project:created', remoteProj);
        } else {
          const localProj = localCache.projetos[localIndex];
          const remoteTime = new Date(remoteProj.AtualizadoEm).getTime();
          const localTime = new Date(localProj.AtualizadoEm).getTime();
          
          if (remoteTime > localTime) {
            localCache.projetos[localIndex] = remoteProj;
            triggerEvent('project:updated', remoteProj);
          }
        }
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

// Utilitários
function getLocalProjects() {
  return [...localCache.projetos];
}

function getLocalConfig(key) {
  return localCache.config[key]?.value;
}

function clearCache() {
  localCache = { projetos: [], config: {} };
  lastSyncTimestamp = 0;
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
  getLocalProjects,
  getLocalConfig,
  on,
  off,
  clearCache
};

// Iniciar polling automaticamente após o carregamento da página
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => startPolling());
} else {
  startPolling();
}
