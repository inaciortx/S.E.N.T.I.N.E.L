# S.E.N.T.I.N.E.L.
**S**istema **E**stratégico de **N**avegação e **T**riagem **I**nteligente para **N**úcleos de **E**mergências **L**ocais.

## 🎯 Finalidade
O **S.E.N.T.I.N.E.L.** é uma plataforma (POC) avançada para o controle logístico de frotas de emergência (Polícia, Bombeiros e SAMU). Ele atua como o "cérebro" de um Centro de Controle Operacional (CCO), despachando viaturas em tempo real no mapa, baseando-se em filas de urgência e otimização de rotas por satélite (OSRM).

## 🚀 Funcionalidades Core
* **Despacho Inteligente e Roteamento GPS:** O sistema calcula rotas reais em tempo real e movimenta viaturas no mapa de forma orgânica.
* **Múltiplos Recursos por Chamado:** Triagem inteligente capaz de designar múltiplos batalhões/bases diferentes para a mesma ocorrência (ex: 3 viaturas do SAMU e 1 Bombeiro).
* **Fila de Espera Automática:** Se a frota atinge 100% de ocupação, novas ocorrências aguardam na fila. Assim que viaturas retornam da missão, são recapturadas instantaneamente para a fila sem intervenção humana.
* **Graceful Degradation:** Resiliência contra quedas da API de satélites (OSRM), com sistema de retentativa inteligente (sem congelar o Front-End).

## ☢️ Motor de Simulação (Stress Test)
Pensado exclusivamente para apresentação da POC e benchmarking, o módulo de simulação conta com:
- **Geração Dinâmica de Caos:** Cria ocorrências de gravidades e tamanhos procedurais por todo o mapa.
- **Acelerador de Partículas (Time Warp):** Um slider capaz de acelerar a viagem das viaturas em até 10x a velocidade real para demonstrações rápidas.
- **Modos Autônomos:** "Auto-Aceite" (bypass da aprovação humana) e "Modo Expresso" (as viaturas resolvem a crise automaticamente ao chegar no local), permitindo que o sistema rode infinitamente em testes de estresse.

## 🛠️ Tecnologias Utilizadas
- **Backend:** Go (Golang)
- **Frontend:** Vanilla JS, HTML5 e CSS3 (Design com Glassmorphism, Neumorphism e Splash Boot Animations).
- **Mapeamento Topográfico:** Leaflet.js
- **Motor de Roteamento:** OSRM (Open Source Routing Machine)

## ⚙️ Como Executar o CCO Localmente

### Pré-requisitos
- [Go](https://go.dev/dl/) instalado na máquina (Testado na v1.20+).

### Passos de Execução
1. Clone este repositório para o seu ambiente local:
   ```bash
   git clone https://github.com/inaciortx/S.E.N.T.I.N.E.L.git
   cd S.E.N.T.I.N.E.L
   ```
2. Inicialize o microsserviço servidor em Go:
   ```bash
   go run cmd/rei-julian/main.go
   ```
3. Em um navegador Web (Chrome/Edge recomendado), acesse:
   ```text
   http://localhost:8080
   ```
   
> O sistema fará a conexão neural e liberará o painel de operação após 3 segundos de Boot (Splash Screen).

---
*S.E.N.T.I.N.E.L. - Logística de precisão para salvar vidas.*
