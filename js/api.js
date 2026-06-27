// ==========================================
// js/api.js - Comunicação com a API
// ==========================================

const API_CONFIG = {
  // Cole aqui a URL da sua API do Apps Script
  URL: "https://script.google.com/macros/s/AKfycbyi5Y_G68bnQ1SOOpE6IkbRQueRmyDEUv2RhvCHQbFAdxCG8rfNs0CqCYA319eDgD9J/exec",
  
  // A senha que você definiu no Apps Script (const API_SECRET)
  SECRET: "16101961", // ⚠️ Substitua pela sua senha real
  
  // Intervalo de polling em milissegundos
  POLLING_INTERVAL: 5000
};

// Estado local para sincronização
let lastSyncTimestamp = 0;
let syncInProgress = false;
let localCache = {
  projetos: [],
  config: {}
};

// ==========================================
// FUNÇÕES DE REQUISIÇÃO
// ==========================================

async function apiRequest(action, payload = {}, method = 'POST') {
  try {
    const response = await fetch(API_CONFIG.URL, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.SECRET}`
      },
      body: method === 'POST' ? JSON.stringify({ action, ...payload }) : undefined
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const result = await response.json();
    
    if (!result.success) {
      console.error('API Error:', result.error);
      throw new Error(result.error || 'Erro desconhecido');
    }
    
    return result;
  } catch (error) {
    console.error('API Request failed:', error);
    // Em produção, mostrar toast de erro ao usuário
    throw error;
  }
}

// ==========================================
// OPERAÇÕES CRUD
// ==========================================

async function createProject(projectData) {
  const result = await apiRequest('create', { data: projectData });
  // Atualiza cache local
  localCache.projetos.push({ ...projectData, ID: result.id, AtualizadoEm: new Date().getTime() });
  return result;
}

async function updateProject(projectData) {
  const result = await apiRequest('update', { data: projectData });
  // Atualiza cache local
  const index = localCache.projetos.findIndex(p => p.ID === projectData.ID);
  if (index !== -1) {
    localCache.projetos[index] = { ...localCache.projetos[index], ...projectData, AtualizadoEm: new Date().getTime() };
  }
  return result;
}

async function deleteProject(projectId) {
  const result = await apiRequest('delete', { id: projectId });
  // Remove do cache local
  localCache.projetos = localCache.projetos.filter(p => p.ID !== projectId);
  return result;
}

async function updateConfig(key, value) {
  const result = await apiRequest('updateConfig', { key, value });
  // Atualiza cache local
  localCache.config[key] = { value, updatedAt: new Date().getTime() };
  return result;
}

async function getConfig(key) {
  const result = await apiRequest('getConfig', { key }, 'GET');
  localCache.config[key] = { value: result.value, updatedAt: new Date().getTime() };
  return result.value;
}

// ==========================================
// SINCRONIZAÇÃO (POLLING)
// ==========================================

async function syncData() {
  if (syncInProgress) return;
  syncInProgress = true;
  
  try {
    const result = await apiRequest('sync', { since: lastSyncTimestamp }, 'GET');
    
    if (result.success && result.data) {
      // Merge dos dados recebidos com o cache local
      result.data.forEach(remoteProj => {
        const localIndex = localCache.projetos.findIndex(p => p.ID === remoteProj.ID);
        
        if (localIndex === -1) {
          // Novo projeto: adiciona
          localCache.projetos.push(remoteProj);
          triggerEvent('project:created', remoteProj);
        } else {
          // Projeto existente: atualiza se for mais recente
          const localProj = localCache.projetos[localIndex];
          const remoteTime = new Date(remoteProj.AtualizadoEm).getTime();
          const localTime = new Date(localProj.AtualizadoEm).getTime();
          
          if (remoteTime > localTime) {
            localCache.projetos[localIndex] = remoteProj;
            triggerEvent('project:updated', remoteProj);
          }
        }
      });
      
      // Atualiza timestamp do último sync
      lastSyncTimestamp = result.timestamp;
      
      // Notifica que sync completou
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
  // Sync inicial imediato
  syncData();
  
  // Polling periódico
  setInterval(syncData, interval);
  console.log(`Polling iniciado: ${interval}ms`);
}

// ==========================================
// SISTEMA DE EVENTOS (PUB/SUB)
// ==========================================

const eventListeners = {};

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

// ==========================================
// UTILITÁRIOS
// ==========================================

function getLocalProjects() {
  return [...localCache.projetos]; // Retorna cópia para evitar mutação externa
}

function getLocalConfig(key) {
  return localCache.config[key]?.value;
}

function clearCache() {
  localCache = { projetos: [], config: {} };
  lastSyncTimestamp = 0;
}

// Exporta funções para uso global
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

// Inicia polling automaticamente se estiver em página principal
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => startPolling());
} else {
  startPolling();
}
