  const map = L.map('map').setView([-31.7650, -52.3413], 14);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
  const markerGroup = L.featureGroup().addTo(map);

  const types = [
    { id: 0, name: "Polícia", emoji: "🚓", cssClass: "icon-police", color: "#007BFF", baseLat: -31.7650, baseLng: -52.3380, baseName: "Batalhão de Polícia" },
    { id: 1, name: "Bombeiros", emoji: "🚒", cssClass: "icon-fire", color: "#dc3545", baseLat: -31.7580, baseLng: -52.3610, baseName: "Corpo de Bombeiros" },
    { id: 2, name: "Ambulância", emoji: "🚑", cssClass: "icon-ambulance", color: "#28a745", baseLat: -31.7610, baseLng: -52.3450, baseName: "Base SAMU" }
  ];

  types.forEach(t => {
    L.marker([t.baseLat, t.baseLng], {
      icon: L.divIcon({className: 'base-icon', html: `🏢`, iconSize: [24, 24], iconAnchor: [12, 12]})
    }).bindTooltip(t.baseName, {permanent: true, direction: 'top', className: 'base-tooltip', offset: [0, -10]}).addTo(map);
  });

  function createIcon(typeConfig) {
    return L.divIcon({ className: `custom-div-icon ${typeConfig.cssClass}`, html: typeConfig.emoji, iconSize: [30, 30], iconAnchor: [15, 15] });
  }

  const incidentIcon = L.divIcon({ className: 'pulse-icon', iconSize: [20, 20], iconAnchor: [10, 10] });

  let fleet = {};
  let viaturaCount = 0;
  let activeIncidents = {}; 
  let incidentCounter = 0;
  let tempPopup = null; 
  let currentFleetFilter = 'All';
  
  // Variáveis da Simulação
  let simulationIntervalId = null;
  let pendingTestIncidents = {}; 
  let testIncidentCounter = 0;
  let simulationSpeed = 1;
  let simulationFreq = 15000;
  let isAutoAccept = false;
  let isAutoFinish = false;

  // --- UI CONTROLS ---
  window.switchTab = function(tabName) {
    ['despacho', 'viaturas', 'gerenciar', 'config'].forEach(t => {
      document.getElementById('tab-' + t).classList.remove('active');
      document.getElementById('btn-tab-' + t).classList.remove('active');
    });
    
    document.getElementById('tab-' + tabName).classList.add('active');
    document.getElementById('btn-tab-' + tabName).classList.add('active');
    
    if (tabName === 'gerenciar') renderManageTab();
    if (tabName === 'viaturas') renderFleetTab();
  };

  function addLog(message, type = 'normal') {
    const logDiv = document.getElementById('activity-log');
    const timeStr = new Date().toLocaleTimeString('pt-BR');
    let infoClass = 'log-info';
    if (type === 'dispatch') infoClass += ' log-dispatch';
    if (type === 'cancel') infoClass += ' log-cancel';
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">[${timeStr}]</span> <span class="${infoClass}">${message}</span>`;
    logDiv.prepend(entry);
  }

  window.clearLogs = function() {
      document.getElementById('activity-log').innerHTML = '';
  };

  function updateCounters() {
    const total = Object.values(fleet).length;
    const available = Object.values(fleet).filter(v => v.status === 'Patrulhando' || v.status === 'Retornando').length;
    document.getElementById('active-count').innerText = available;
    document.getElementById('incident-count').innerText = (total - available);
    
    const progressEl = document.getElementById('fleet-progress');
    if (progressEl) {
        const percent = total > 0 ? ((total - available) / total) * 100 : 0;
        progressEl.style.width = percent + '%';
    }
    
    if (document.getElementById('tab-gerenciar').classList.contains('active')) renderManageTab();
    if (document.getElementById('tab-viaturas').classList.contains('active')) renderFleetTab();
  }

  function getStatusBadge(status) {
    let cls = '';
    if (status === 'Patrulhando') cls = 'status-patrulhando';
    else if (status === 'Ocorrência') cls = 'status-ocorrencia';
    else if (status === 'Retornando') cls = 'status-retornando';
    else if (status === 'No Local') cls = 'status-nolocal';
    return `<span class="status-badge ${cls}">${status}</span>`;
  }

  // --- ABA: GERENCIAR OCORRÊNCIAS ---
  function renderManageTab() {
    const list = document.getElementById('manage-list');
    const incidents = Object.values(activeIncidents);
    
    if (incidents.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: #777; padding: 20px 0; font-style: italic;">Nenhuma ocorrência em andamento.</div>`;
        return;
    }

    list.innerHTML = incidents.map(inc => {
        // Formata as viaturas designadas mostrando quem já chegou
        const assignedHTML = inc.assignedIds.map(vid => {
            const v = fleet[vid];
            const arrivedMark = (v && v.status === 'No Local') ? '✅ ' : '⏳ ';
            return arrivedMark + vid;
        }).join('<br>');
        
        const actionButton = inc.waitingManualClose 
            ? `<button class="btn-create" style="width:100%; margin-top:10px; background:linear-gradient(135deg, #28a745, #218838)" onclick="finishIncident('${inc.id}')">✅ Finalizar Ocorrência</button>`
            : `<button class="btn-danger" onclick="cancelIncident('${inc.id}')">❌ Cancelar Toda a Ocorrência</button>`;

        let pendingText = '';
        if (inc.pendingTypes && inc.pendingTypes.length > 0) {
            const names = inc.pendingTypes.map(t => types.find(x => x.id === t)?.emoji).join(' ');
            pendingText = `<div style="color: #ffc107; font-weight: bold; font-size: 11px; margin-top: 5px;">⏳ Aguardando Recursos: ${names}</div>`;
        }

        return `
        <div class="card" style="border-left: 4px solid ${inc.waitingManualClose ? '#28a745' : '#ff6b6b'}">
            <div class="card-title" style="color: ${inc.waitingManualClose ? '#28a745' : '#ff6b6b'}">🚨 Ocorrência #${inc.id} ${inc.waitingManualClose ? '(Controlada)' : ''}</div>
            <div class="card-detail">Descrição: <span style="color: #ffc107; font-weight: normal;">"${inc.desc}"</span></div>
            <div class="card-detail" style="margin-top: 5px;">Unidades Designadas: <br><span style="display:inline-block; margin-top:3px; line-height: 1.4;">${assignedHTML || '<i>Nenhuma</i>'}</span></div>
            ${pendingText}
            ${actionButton}
        </div>
        `;
    }).join('');
  }

  window.cancelIncident = function(incId) {
    const inc = activeIncidents[incId];
    if (!inc) return;

    delete activeIncidents[incId];
    if (inc.marker) map.removeLayer(inc.marker);

    inc.assignedIds.forEach((vid, idx) => {
        if (fleet[vid]) {
            fleet[vid].status = 'Patrulhando';
            fleet[vid].incidentId = null;
            fleet[vid].route = null;
            addLog(`Despacho de <b>${vid}</b> cancelado. Liberada.`, 'cancel');
            
            if (inc.lines[idx]) map.removeLayer(inc.lines[idx]);
            
            const reassigned = checkPendingIncidents(fleet[vid]);
            if (!reassigned) {
                fetchRoute(fleet[vid]);
            }
        }
    });
    
    updateCounters();
  };

  window.finishIncident = function(incId, autoMsg = null) {
    const inc = activeIncidents[incId];
    if (!inc) return;

    delete activeIncidents[incId];
    if (inc.marker) map.removeLayer(inc.marker);

    inc.assignedIds.forEach((vid, idx) => {
        if (fleet[vid]) {
            fleet[vid].status = 'Patrulhando';
            fleet[vid].incidentId = null;
            fleet[vid].route = null;
            
            if (inc.lines[idx]) map.removeLayer(inc.lines[idx]);
            
            const reassigned = checkPendingIncidents(fleet[vid]);
            if (!reassigned) {
                fetchRoute(fleet[vid]);
            }
        }
    });
    
    addLog(autoMsg || `✅ Ocorrência #${incId} finalizada manualmente. Viaturas retornando à patrulha.`);
    updateCounters();
  };

  // --- ABA: GERENCIAR FROTA ---
  window.setFleetFilter = function(type) {
    currentFleetFilter = type;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (type === 'All' && btn.innerText === 'Todas') btn.classList.add('active');
        else if (type === 0 && btn.innerText === 'Polícia') btn.classList.add('active');
        else if (type === 1 && btn.innerText === 'Bombeiros') btn.classList.add('active');
        else if (type === 2 && btn.innerText === 'SAMU') btn.classList.add('active');
    });
    renderFleetTab();
  };

  function renderFleetTab() {
    const list = document.getElementById('fleet-list');
    let vehicles = Object.values(fleet);

    if (currentFleetFilter !== 'All') {
        vehicles = vehicles.filter(v => v.typeConfig.id === currentFleetFilter);
    }

    if (vehicles.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: #777; padding: 20px 0; font-style: italic;">A frota está vazia.</div>`;
        return;
    }

    list.innerHTML = vehicles.map(v => {
        const canRecall = v.status !== 'Retornando' && v.status !== 'Ocorrência' && v.status !== 'No Local';
        const disableAttr = !canRecall ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : '';
        
        return `
        <div class="card" style="border-left: 4px solid ${v.typeConfig.color}">
            <div class="card-title" style="color: ${v.typeConfig.color}; display: flex; justify-content: space-between;">
              <span>${v.typeConfig.emoji} ${v.id}</span>
              ${getStatusBadge(v.status)}
            </div>
            ${(v.status === 'Ocorrência' || v.status === 'No Local') ? `<div class="card-detail">Ocorrência Ativa: <span>#${v.incidentId}</span></div>` : ''}
            <button class="btn-warning" onclick="returnToBase('${v.id}')" ${disableAttr}>🔙 Retornar para a Base</button>
        </div>
        `;
    }).join('');
  }

  function showToast(message, type = 'error') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = message;
    document.body.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  window.returnToBase = async function(id) {
    const v = fleet[id];
    if (!v) return;

    if (v.status === 'Ocorrência' || v.status === 'No Local') {
        showToast("⚠️ Atenção: Esta viatura está atendendo uma ocorrência crítica e não pode ser recolhida à base. Cancele a ocorrência na aba 'Ocorrências' primeiro se necessário.", "error");
        return;
    }

    v.status = 'Retornando';
    addLog(`<b>${v.id}</b> retornando para a base. Ela será desmobilizada ao chegar.`, 'cancel');
    updateCounters();

    await fetchRoute(v, v.typeConfig.baseLat, v.typeConfig.baseLng);
  };


  // --- CRIAÇÃO E DESTRUIÇÃO DE VIATURAS ---
  function spawnVehicle(typeId, initialStatus = 'Patrulhando') {
    viaturaCount++;
    const id = "VTR-" + viaturaCount.toString().padStart(2, '0');
    const typeConfig = types.find(t => t.id === typeId); 
    
    if(!typeConfig) {
        console.error("Configuração de tipo inválida:", typeId);
        return null;
    }
    
    const lat = typeConfig.baseLat;
    const lng = typeConfig.baseLng;

    const marker = L.marker([lat, lng], {icon: createIcon(typeConfig)})
      .bindTooltip(`${id}`, {permanent: true, direction: 'bottom', offset: [0, 15], className: 'viatura-tooltip'})
      .addTo(markerGroup);
      
    fleet[id] = { id: id, typeConfig: typeConfig, lat: lat, lng: lng, marker: marker, route: null, routeIndex: 0, isFetching: false, status: initialStatus, incidentId: null };
    
    if (initialStatus === 'Patrulhando') {
      addLog(`Unidade <b>${id}</b> criada na base (${typeConfig.name}) e iniciou patrulha.`);
    }
    updateCounters();
    return id; 
  }

  function destroyVehicle(id) {
    const v = fleet[id];
    if (!v) return;
    
    map.removeLayer(v.marker);
    if (v.routeLine) map.removeLayer(v.routeLine); 
    delete fleet[id];
    
    addLog(`Unidade <b>${id}</b> chegou à base e foi recolhida do mapa.`, 'cancel');
    updateCounters();
  }

  function countVehicles(typeId) {
      return Object.values(fleet).filter(v => v.typeConfig.id === typeId).length;
  }

  function checkPendingIncidents(v) {
      const typeId = v.typeConfig.id;
      for (let incId in activeIncidents) {
          let inc = activeIncidents[incId];
          if (inc.pendingTypes && inc.pendingTypes.includes(typeId)) {
              const idx = inc.pendingTypes.indexOf(typeId);
              inc.pendingTypes.splice(idx, 1);
              
              v.status = 'Ocorrência';
              v.incidentId = inc.id;
              inc.assignedIds.push(v.id);
              
              addLog(`⚡ <b>${v.id}</b> designada da fila de espera para a Ocorrência #${inc.id}.`, 'dispatch');
              
              const line = L.polyline([L.latLng(inc.lat, inc.lng), [v.lat, v.lng]], {color: v.typeConfig.color, dashArray: '5, 10', weight: 4, opacity: 0.8}).addTo(map);
              inc.lines.push(line);
              
              fetchRoute(v, inc.lat, inc.lng);
              updateCounters();
              return true; 
          }
      }
      return false;
  }

  window.addSelectedVehicle = function() {
    const typeId = parseInt(document.getElementById('spawn-type').value);
    const maxAllowed = parseInt(document.getElementById('max-' + typeId).value) || 0;
    
    if (countVehicles(typeId) >= maxAllowed) {
        showToast(`⛔ Limite máximo de ${types[typeId].name} (${maxAllowed}) atingido.`, "error");
        return;
    }
    
    const newId = spawnVehicle(typeId);
    if (newId && fleet[newId]) {
        checkPendingIncidents(fleet[newId]);
    }
  };

  // --- LÓGICA DE ROTAS ---
  async function fetchRoute(v, destLat, destLng) {
    if (v.isFetching) return;
    v.isFetching = true;
    
    if (!destLat || !destLng) {
      destLat = v.lat + (Math.random() - 0.5) * 0.03;
      destLng = v.lng + (Math.random() - 0.5) * 0.03;
    }

    try {
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${v.lng},${v.lat};${destLng},${destLat}?overview=full&geometries=geojson`);
        if (!res.ok) throw new Error("OSRM indisponível");
        const data = await res.json();
        
        if (data.code !== 'Ok') throw new Error("Rota não encontrada");
        
        const coords = data.routes[0].geometry.coordinates;
        v.route = coords;
        v.routeIndex = 0;
    } catch (e) { }
    v.isFetching = false;
  }

  setInterval(() => {
    for (let id in fleet) {
      let v = fleet[id];
      
      if (v.status === 'No Local') {
         // Não faz nada, fica parado na cena da ocorrência aguardando as outras
         continue;
      }
      
      if (v.isFetching) continue; // Trava contra fechamento prematuro de ocorrências
      
      if (!v.route || v.routeIndex >= v.route.length) {
        // Chegou ao destino
        if (v.status === 'Ocorrência') {
            const incId = v.incidentId;
            const inc = activeIncidents[incId];
            
            if (inc) {
                // Ao invés de voltar a patrulhar imediatamente, a viatura FICA NO LOCAL
                v.status = 'No Local';
                addLog(`Unidade <b>${id}</b> chegou na ocorrência #${incId}. Aguardando na cena...`);
                
                // Remove APENAS A LINHA desta viatura
                const idx = inc.assignedIds.indexOf(id);
                if (idx > -1 && inc.lines[idx]) {
                    map.removeLayer(inc.lines[idx]);
                    inc.lines[idx] = null; // marca como limpa
                }
                
                // VERIFICA SE TODAS AS VIATURAS DESIGNADAS CHEGARAM
                let allArrived = true;
                for (let vid of inc.assignedIds) {
                    if (fleet[vid] && fleet[vid].status !== 'No Local') {
                        allArrived = false;
                        break;
                    }
                }
                
                if (allArrived && !inc.waitingManualClose && (!inc.pendingTypes || inc.pendingTypes.length === 0)) {
                    if (isAutoFinish) {
                        finishIncident(incId, `✅ Ocorrência #${incId} auto-finalizada! (Modo Expresso)`);
                    } else {
                        inc.waitingManualClose = true;
                        addLog(`✅ Todas as unidades no local. Ocorrência #${incId} controlada. Aguardando finalização manual.`);
                        updateCounters();
                    }
                }
            } else {
                v.status = 'Patrulhando';
                v.incidentId = null;
            }
            updateCounters();
        } else if (v.status === 'Retornando') {
            destroyVehicle(v.id);
            continue; 
        }
        
        if (v.status === 'Patrulhando') fetchRoute(v); 
      } else {
        let step = (v.status === 'Ocorrência' || v.status === 'Retornando' ? 2 : 1) * simulationSpeed;
        let targetIndex = v.routeIndex + step;
        
        if (targetIndex >= v.route.length) {
             v.routeIndex = v.route.length; // Garante que vai disparar a chegada no próximo tick
             let pt = v.route[v.route.length - 1];
             v.lng = pt[0]; v.lat = pt[1];
             v.marker.setLatLng([v.lat, v.lng]);
        } else {
             v.routeIndex = targetIndex;
             let pt = v.route[v.routeIndex];
             v.lng = pt[0]; v.lat = pt[1];
             v.marker.setLatLng([v.lat, v.lng]);
        }
      }
    }
    
    // Atualiza linhas de múltiplas ocorrências apenas para quem está em movimento
    for(let incId in activeIncidents) {
        const inc = activeIncidents[incId];
        inc.assignedIds.forEach((vid, idx) => {
            const v = fleet[vid];
            if (v && v.status === 'Ocorrência' && inc.marker && inc.lines[idx]) {
                inc.lines[idx].setLatLngs([inc.marker.getLatLng(), [v.lat, v.lng]]);
            }
        });
    }
  }, 1000);

  // --- CLIQUE E SELEÇÃO MÚLTIPLA DE TIPO ---
  map.on('click', async function(e) {
    const originalLat = e.latlng.lat;
    const originalLng = e.latlng.lng;

    try {
        const res = await fetch(`https://router.project-osrm.org/nearest/v1/driving/${originalLng},${originalLat}`);
        const data = await res.json();

        if (data.code !== 'Ok' || !data.waypoints || data.waypoints.length === 0) {
            showToast("❌ Erro ao validar o local. Tente novamente.", "error");
            return;
        }

        const snapped = data.waypoints[0];
        if (snapped.distance > 100) {
            showToast("⛔ Local inválido para ocorrência. Selecione um ponto mais próximo à via.", "error");
            return;
        }

        const lng = snapped.location[0];
        const lat = snapped.location[1];

        const popupContent = `
            <div style="text-align: center; width: 220px;">
                <b style="color: #ff6b6b; font-size: 14px;">Registrar Incidente</b><br>
                <div class="checkbox-group">
                  <label class="checkbox-label"><input type="checkbox" class="inc-cb" value="0"> 🚓 Polícia</label>
                  <label class="checkbox-label"><input type="checkbox" class="inc-cb" value="1"> 🚒 Bombeiros</label>
                  <label class="checkbox-label"><input type="checkbox" class="inc-cb" value="2" checked> 🚑 Ambulância</label>
                </div>
                <textarea id="incident-desc" class="popup-input" placeholder="Detalhes..."></textarea>
                <button class="btn-danger" style="margin-top: 10px;" onclick="confirmIncident(${lat}, ${lng})">Confirmar e Despachar</button>
            </div>
        `;

        tempPopup = L.popup({closeButton: true, minWidth: 240})
            .setLatLng([lat, lng]).setContent(popupContent).openOn(map);

    } catch (err) {
        showToast("❌ Falha na comunicação com o servidor de rotas.", "error");
    }
  });

  window.confirmIncident = async function(lat, lng, forcedTypes = null, forcedDesc = null) {
    const checkedBoxes = forcedTypes !== null 
        ? forcedTypes 
        : Array.from(document.querySelectorAll('.inc-cb:checked')).map(cb => parseInt(cb.value));
    
    if (checkedBoxes.length === 0) {
        showToast("⚠️ Selecione pelo menos um tipo de viatura para atender a ocorrência.", "error");
        return;
    }

    let finalDesc = forcedDesc;
    if (finalDesc === null) {
        const descInput = document.getElementById('incident-desc');
        finalDesc = descInput && descInput.value.trim() !== "" ? descInput.value.trim() : "Sem descrição";
    }

    if (tempPopup && forcedTypes === null) { map.closePopup(tempPopup); }

    const destLatLng = L.latLng(lat, lng);
    
    incidentCounter++;
    const incId = incidentCounter.toString();
    const marker = L.marker(destLatLng, {icon: incidentIcon}).addTo(map);
    
    addLog(`⚠️ Ocorrência #${incId} registrada: "${finalDesc}"`);

    const assignedIds = [];
    const lines = [];
    const pendingTypes = [];

    // Roda o algoritmo de despacho para CADA tipo selecionado
    for (let typeSelect of checkedBoxes) {
        const reqTypeConfig = types.find(t => t.id === typeSelect);
        if(!reqTypeConfig) continue;

        let closestId = null;
        let minDistance = Infinity;

        // 1. Viaturas na rua
        for (let id in fleet) {
          let v = fleet[id];
          if (v.status === 'Ocorrência' || v.status === 'No Local' || v.status === 'Retornando' || v.typeConfig.id !== typeSelect) continue; 
          if (assignedIds.includes(id)) continue; // Evita designar a mesma viatura duas vezes na mesma ocorrência
          
          let dist = destLatLng.distanceTo(L.latLng(v.lat, v.lng));
          if (dist < minDistance) { minDistance = dist; closestId = id; }
        }

        // 2. Distância da Base
        let baseDist = destLatLng.distanceTo(L.latLng(reqTypeConfig.baseLat, reqTypeConfig.baseLng));
        let dispatchedVehicleId = null;

        // 3. Decisão
        const maxAllowed = parseInt(document.getElementById('max-' + typeSelect).value) || 0;
        const currentCount = countVehicles(typeSelect);

        if (currentCount < maxAllowed && (baseDist < minDistance || closestId === null)) {
            dispatchedVehicleId = spawnVehicle(typeSelect, 'Ocorrência');
        } else if (closestId !== null) {
            dispatchedVehicleId = closestId;
        } else {
            pendingTypes.push(typeSelect);
            addLog(`⏳ Sem unidades ociosas de <b>${reqTypeConfig.name}</b>. Ocorrência #${incId} na fila de espera.`, 'cancel');
            continue;
        }
        
        if (!dispatchedVehicleId) continue; // Safety check

        const cv = fleet[dispatchedVehicleId];
        cv.status = 'Ocorrência';
        cv.incidentId = incId;
        
        let dispatchDist = (baseDist < minDistance || closestId === null) ? baseDist : minDistance;
        addLog(`🚨 <b>${cv.id}</b> (${reqTypeConfig.name}) a caminho da ocorrência #${incId}. (${(dispatchDist/1000).toFixed(2)} km)`, 'dispatch');
        
        const line = L.polyline([destLatLng, [cv.lat, cv.lng]], {color: reqTypeConfig.color, dashArray: '5, 10', weight: 4, opacity: 0.8}).addTo(map);
        
        assignedIds.push(cv.id);
        lines.push(line);
        
        fetchRoute(cv, lat, lng); // async
    }

    // Salva o incidente com arrays de viaturas designadas e linhas
    activeIncidents[incId] = {
        id: incId, marker: marker, lines: lines,
        desc: finalDesc, lat: lat, lng: lng, assignedIds: assignedIds,
        waitingManualClose: false, pendingTypes: pendingTypes
    };
    
    updateCounters(); 
  };

  // --- MODO SIMULAÇÃO ---
  window.updateSimulationConfig = function() {
      simulationSpeed = parseInt(document.getElementById('sim-speed').value) || 1;
      const newFreq = parseInt(document.getElementById('sim-freq').value) * 1000;
      isAutoAccept = document.getElementById('toggle-autoaccept').checked;
      isAutoFinish = document.getElementById('toggle-autofinish').checked;
      
      if (simulationIntervalId && newFreq !== simulationFreq) {
          simulationFreq = newFreq;
          clearInterval(simulationIntervalId);
          simulationIntervalId = setInterval(generateRandomIncident, simulationFreq);
          addLog(`Configuração: Frequência de geração alterada para ${newFreq/1000}s`, 'normal');
      } else {
          simulationFreq = newFreq;
      }
  };

  window.toggleSimulation = function() {
      const isChecked = document.getElementById('toggle-sim').checked;
      if (isChecked) {
          updateSimulationConfig();
          showToast(`🕹️ Modo Simulação Ativado! Frequência: ${simulationFreq/1000}s`, "info");
          simulationIntervalId = setInterval(generateRandomIncident, simulationFreq);
      } else {
          showToast("⏹️ Modo Simulação Desativado.", "info");
          clearInterval(simulationIntervalId);
          simulationIntervalId = null;
      }
  };

  async function generateRandomIncident() {
      const lat = -31.7650 + (Math.random() - 0.5) * 0.05;
      const lng = -52.3413 + (Math.random() - 0.5) * 0.05;

      try {
          const res = await fetch(`https://router.project-osrm.org/nearest/v1/driving/${lng},${lat}`);
          if (!res.ok) throw new Error("OSRM indisponível");
          const data = await res.json();
          if (data.code !== 'Ok' || !data.waypoints || data.waypoints.length === 0) return;
          
          const snapped = data.waypoints[0];
          if (snapped.distance > 200) return; 
          
          const finalLng = snapped.location[0];
          const finalLat = snapped.location[1];
          
          testIncidentCounter++;
          const tId = 'T-' + testIncidentCounter;
          
          const urgenciesInfo = [
              { label: 'Baixa', reqRange: [1, 1], vicRange: [0, 0] },
              { label: 'Média', reqRange: [1, 2], vicRange: [0, 1] },
              { label: 'Alta', reqRange: [2, 3], vicRange: [1, 3] },
              { label: 'Crítica', reqRange: [3, 5], vicRange: [2, 5] },
          ];
          const urgData = urgenciesInfo[Math.floor(Math.random() * urgenciesInfo.length)];
          const urg = urgData.label;
          const victims = urgData.vicRange[0] + Math.floor(Math.random() * (urgData.vicRange[1] - urgData.vicRange[0] + 1));
          const numReqs = urgData.reqRange[0] + Math.floor(Math.random() * (urgData.reqRange[1] - urgData.reqRange[0] + 1));
          
          const maxTypes = [
              parseInt(document.getElementById('max-0').value) || 0,
              parseInt(document.getElementById('max-1').value) || 0,
              parseInt(document.getElementById('max-2').value) || 0
          ];

          const reqTypes = [];
          const currentReqCounts = [0, 0, 0];

          for (let i=0; i<numReqs; i++) {
              let availableTypes = [0, 1, 2].filter(t => currentReqCounts[t] < maxTypes[t]);
              if (availableTypes.length === 0) break; // Trava contra Deadlocks!
              
              let pickedType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
              reqTypes.push(pickedType);
              currentReqCounts[pickedType]++;
          }
          
          if (reqTypes.length === 0) return; // Limites zerados
          
          reqTypes.sort();
          
          const pendingIcon = L.divIcon({ className: 'pending-icon', iconSize: [24, 24], iconAnchor: [12, 12] });
          const marker = L.marker([finalLat, finalLng], {icon: pendingIcon}).addTo(map);
          
          const reqNames = reqTypes.map(tId => types.find(t => t.id === tId)?.emoji).join(' ');

          const popupContent = `
              <div style="text-align: center; width: 220px;">
                  <b style="color: #ffc107; font-size: 14px;">Chamado #${tId}</b><br>
                  <div style="font-size: 12px; margin: 10px 0; text-align: left; background: rgba(0,0,0,0.5); padding: 8px; border-radius: 6px;">
                      <b>Urgência:</b> ${urg}<br>
                      <b>Vítimas:</b> ${victims}<br>
                      <b>Viaturas Necessárias:</b> ${reqNames}
                  </div>
                  <button class="btn-create" style="width: 100%; background: linear-gradient(135deg, #ffc107, #ff9800); color: #000; font-weight: bold;" onclick="acceptTestIncident('${tId}')">✅ Aceitar Chamado</button>
              </div>
          `;
          marker.bindPopup(popupContent);
          
          pendingTestIncidents[tId] = {
              id: tId, marker: marker, lat: finalLat, lng: finalLng, 
              reqTypes: reqTypes, desc: `Simulação: Urgência ${urg}, ${victims} Vítimas`,
          };
          
          if (isAutoAccept) {
              acceptTestIncident(tId);
          } else {
              addLog(`⚠️ Novo chamado de emergência detectado! (Marcador Amarelo)`, 'normal');
          }
          
      } catch (err) {
          console.warn("[SENTINELA] Falha na simulação.", err);
          showToast("⚠️ Instabilidade no motor de simulação (Satélites OSRM offline).", "warning");
      }
  }

  window.acceptTestIncident = function(tId) {
      const pInc = pendingTestIncidents[tId];
      if (!pInc) return;
      
      map.removeLayer(pInc.marker);
      delete pendingTestIncidents[tId];
      
      confirmIncident(pInc.lat, pInc.lng, pInc.reqTypes, pInc.desc);
  };

  // Inicializa uma viatura de cada para povoar o mapa
  spawnVehicle(0); // Polícia
  spawnVehicle(1); // Bombeiro
  spawnVehicle(2); // Samu

  // --- S.E.N.T.I.N.E.L. BOOT SEQUENCE ---
  window.onload = function() {
      const splash = document.getElementById('splash-screen');
      if (splash) {
          const statusText = document.querySelector('.splash-status');
          
          setTimeout(() => { if(statusText) statusText.innerText = "SINCRONIZANDO COM CCO..."; }, 1000);
          setTimeout(() => { if(statusText) statusText.innerText = "ESTABELECENDO REDE NEURAL S.E.N.T.I.N.E.L..."; }, 2000);
          
          setTimeout(() => {
              splash.style.opacity = '0';
              setTimeout(() => { splash.style.visibility = 'hidden'; }, 800);
              showToast("S.E.N.T.I.N.E.L. Operacional.", "info");
          }, 3200);
      }
      
      updateSimulationConfig();
  };

  setTimeout(() => { 
      map.fitBounds(markerGroup.getBounds(), {padding: [50, 50]}); 
      showToast("🚀 Sistema Iniciado: Painel de Despacho Online!", "info");
  }, 500);
