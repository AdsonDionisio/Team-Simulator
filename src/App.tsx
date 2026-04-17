import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Play, 
  MessageSquare, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Kanban as KanbanIcon,
  Users,
  Terminal,
  RefreshCw,
  Trophy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';

interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  complexity: number; // 1-5
  priority: 'low' | 'medium' | 'high';
  assignee: string;
  progress: number; // 0-100
  blocker?: string;
}

interface SimulationState {
  tasks: Task[];
  currentSprint: number;
  currentDay: number;
  projectTheme: string;
  isSimulating: boolean;
  phase: 'setup' | 'backlog_generation' | 'sprint_planning' | 'working' | 'standup';
  standupDialogues?: { member: string; speech: string }[];
  history: string[];
}

const COLUMN_NAMES: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'A Fazer',
  in_progress: 'Em Progresso',
  review: 'Revisão',
  done: 'Concluído'
};

const TEAM_MEMBERS = ['Alice (Frontend)', 'Bob (Backend)', 'Charlie (QA)', 'Diana (DevOps)'];

// --- AI Service ---

export default function App() {
  const [state, setState] = useState<SimulationState>({
    tasks: [],
    currentSprint: 0,
    currentDay: 0,
    projectTheme: '',
    isSimulating: false,
    phase: 'setup',
    history: []
  });

  const [themeInput, setThemeInput] = useState('Uma plataforma de comércio eletrônico para produtos sustentáveis');
  const [selectedModel, setSelectedModel] = useState('llama3.2:3b');
  const [isLoading, setIsLoading] = useState(false);

  // --- Helpers ---

  const callAI = async (prompt: string, system: string = "") => {
    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, system, model: selectedModel })
      });
      
      if (!response.ok) throw new Error("AI Proxy Error");
      const data = await response.json();
      const cleanString = data.response.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanString);
    } catch (err) {
      console.error("AI call failed:", err);
      throw err;
    }
  };

  const addHistory = (msg: string) => {
    setState(prev => ({ ...prev, history: [msg, ...prev.history].slice(0, 50) }));
  };

  const generateBacklog = async () => {
    if (!themeInput) return;
    setIsLoading(true);
    setState(prev => ({ ...prev, phase: 'backlog_generation', projectTheme: themeInput }));

    try {
      const system = `Você é um Product Owner experiente. Atue como um gerador de backlog.
      Retorne um JSON com exatamente 8 tarefas para o projeto fornecido.
      Formato JSON exigido: { "tasks": [{ "title", "description", "complexity" (1-5), "priority" ("low","medium","high") }] }
      APENAS O JSON.`;
      
      const prompt = `Gere o backlog para o projeto: "${themeInput}"`;
      const data = await callAI(prompt, system);
      
      const newTasks: Task[] = data.tasks.map((t: any, i: number) => ({
        ...t,
        id: `task-${Date.now()}-${i}`,
        status: 'backlog',
        progress: 0,
        assignee: 'Não atribuído'
      }));

      setState(prev => ({
        ...prev,
        tasks: newTasks,
        phase: 'sprint_planning',
        currentSprint: 1
      }));
      addHistory(`Backlog gerado para: ${themeInput}`);
    } catch (error) {
      console.error("Erro ao gerar backlog:", error);
      addHistory("Erro ao gerar backlog. Tente novamente.");
      setState(prev => ({ ...prev, phase: 'setup' }));
    } finally {
      setIsLoading(false);
    }
  };

  const startSprint = async () => {
    // Basic planning: move high priority tasks and some others to Todo
    setState(prev => {
      const updatedTasks = prev.tasks.map(t => {
        if (t.status === 'backlog' && (t.priority === 'high' || Math.random() > 0.5)) {
          return { ...t, status: 'todo' as TaskStatus };
        }
        return t;
      });
      return { ...prev, tasks: updatedTasks, phase: 'working', currentDay: 1 };
    });
    addHistory("Sprint 1 iniciada. Equipe começou a planejar o trabalho.");
  };

  const simulateRound = async () => {
    if (state.isSimulating) return;
    setIsLoading(true);
    setState(prev => ({ ...prev, isSimulating: true }));

    try {
      const activeTasks = state.tasks.filter(t => t.status !== 'backlog' && t.status !== 'done');
      const system = `Aja como o motor de simulação de uma equipe Ágil. Dia ${state.currentDay}, Sprint ${state.currentSprint}.
      Gere progresso para as tarefas fornecidas. Use 'in_progress' para as que o time focar.
      Retorne JSON: { "updates": [{ "id", "progressDelta", "newStatus", "blocker" (opcional), "devComment" }], "dialogues": [{ "member", "speech" }] }
      Membros: Alice (Frontend), Bob (Backend), Charlie (QA), Diana (DevOps).
      APENAS O JSON.`;

      const prompt = `TAREFAS ATUAIS: ${JSON.stringify(activeTasks)}`;
      const result = await callAI(prompt, system);
      
      setState(prev => {
        const nextTasks = [...prev.tasks];
        result.updates.forEach((update: any) => {
          const idx = nextTasks.findIndex(t => t.id === update.id);
          if (idx !== -1) {
            let newTask = { ...nextTasks[idx] };
            newTask.progress = Math.min(100, newTask.progress + (update.progressDelta || 0));
            newTask.status = (update.newStatus || newTask.status) as TaskStatus;
            newTask.blocker = update.blocker || undefined;
            
            // Assign a dev if it's new and in_progress
            if (newTask.status === 'in_progress' && (newTask.assignee === 'Não atribuído' || !newTask.assignee)) {
              newTask.assignee = TEAM_MEMBERS[Math.floor(Math.random() * TEAM_MEMBERS.length)];
            }
            
            nextTasks[idx] = newTask;
            addHistory(`${newTask.assignee || 'Sistema'}: ${update.devComment}`);
          }
        });

        return {
          ...prev,
          tasks: nextTasks,
          phase: 'standup',
          standupDialogues: result.dialogues,
          isSimulating: false
        };
      });

    } catch (error) {
      console.error("Erro na simulação:", error);
      setState(prev => ({ ...prev, isSimulating: false }));
      addHistory("A simulação falhou neste turno. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const nextIteration = () => {
    setState(prev => ({
      ...prev,
      phase: 'working',
      currentDay: prev.currentDay + 1
    }));
  };

  const resetAll = () => {
    setState({
      tasks: [],
      currentSprint: 0,
      currentDay: 0,
      projectTheme: '',
      isSimulating: false,
      phase: 'setup',
      history: []
    });
  };

  // --- Components ---

  const Column = ({ status, tasks }: { status: TaskStatus; tasks: Task[] }) => (
    <div className="flex flex-col min-w-[280px] w-[280px] h-full bg-[#E2E8F0] rounded-lg overflow-hidden">
      <div className="p-3 bg-white/50 backdrop-blur-sm flex items-center justify-between sticky top-0 z-10">
        <h3 className="font-bold text-[12px] text-slate-500 uppercase tracking-wider flex items-center gap-2">
          {status === 'todo' && <Clock className="w-3.5 h-3.5 text-blue-500" />}
          {status === 'in_progress' && <RefreshCw className="w-3.5 h-3.5 text-orange-500 animate-[spin_3s_linear_infinite]" />}
          {status === 'review' && <AlertCircle className="w-3.5 h-3.5 text-purple-500" />}
          {status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
          {status === 'backlog' && <KanbanIcon className="w-3.5 h-3.5 text-slate-400" />}
          {COLUMN_NAMES[status]}
          <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-slate-100 rounded-full text-slate-500 font-mono">
            {tasks.length}
          </span>
        </h3>
      </div>
      <div className="p-3 flex-1 overflow-y-auto space-y-3 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {tasks.map(task => (
            <motion.div
              key={task.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`p-3 bg-white rounded-md shadow-sm border-l-4 border-slate-200 cursor-grab hover:shadow-md transition-all group relative ${
                task.priority === 'high' ? 'border-l-[#EF4444]' : 
                task.priority === 'medium' ? 'border-l-[#F59E0B]' : 
                'border-l-[#10B981]'
              } ${task.blocker ? 'bg-red-50/50' : ''}`}
            >
              <div className="flex justify-between items-start mb-1 text-[10px]">
                <span className="font-bold text-slate-400">#{task.id.split('-').pop()}</span>
                <span className="font-mono text-slate-400">CPX: {task.complexity}</span>
              </div>
              <h4 className="font-semibold text-slate-800 text-[13px] mb-1 leading-snug">{task.title}</h4>
              <p className="text-[11px] text-slate-500 line-clamp-2 mb-4 leading-relaxed">
                {task.description}
              </p>
              
              <div className="flex items-center justify-between text-[10px] mt-auto">
                <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                  <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[8px] border border-slate-200">
                    {task.assignee.charAt(0)}
                  </div>
                  <span className="truncate max-w-[80px]">{task.assignee}</span>
                </div>
                {status !== 'backlog' && (
                  <div className="flex items-center gap-2 flex-1 max-w-[100px] ml-4">
                    <div className="h-1.5 bg-slate-100 rounded-full flex-1 overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${task.progress}%` }}
                        className={`h-full transition-all duration-1000 ${task.progress >= 100 ? 'bg-green-500' : 'bg-blue-500'}`} 
                      />
                    </div>
                    <span className="text-slate-500 font-mono tabular-nums">{task.progress}%</span>
                  </div>
                )}
              </div>

              {task.blocker && (
                <div className="mt-3 p-2 bg-red-100/50 border border-red-200 rounded-lg text-[10px] text-red-700 flex items-start gap-1.5 animate-pulse">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span><strong>BLOQUEIO:</strong> {task.blocker}</span>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {tasks.length === 0 && (
          <div className="h-20 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-xl opacity-30">
             <span className="text-[10px] uppercase font-bold tracking-widest">Vazio</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-screen bg-[#F1F5F9] text-[#1E293B] font-sans selection:bg-blue-100 flex flex-col overflow-hidden">
      {/* Navbar UI */}
      <nav className="h-20 shrink-0 bg-white border-b border-[#E2E8F0] flex items-center justify-between px-6 z-30">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-[#2563EB] rounded-md flex items-center justify-center text-white font-bold shadow-sm">
            D
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold tracking-tight text-[#2563EB]">
              DevSim AI
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Modelo:</span>
            <select 
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-transparent text-xs font-semibold focus:outline-none text-slate-700 cursor-pointer"
            >
              <option value="llama3.2:3b">llama3.2:3b</option>
              <option value="llama3.1:latest">llama3.1:latest</option>
              <option value="gemma4:e4b">gemma4:e4b</option>
            </select>
          </div>

          {state.phase !== 'setup' && (
             <div className="flex items-center gap-8">
               <div className="text-center">
                 <span className="block text-[10px] uppercase tracking-wider text-[#64748B] font-bold">Sprint</span>
                 <span className="text-sm font-semibold">#{state.currentSprint}</span>
               </div>
               <div className="text-center">
                 <span className="block text-[10px] uppercase tracking-wider text-[#64748B] font-bold">Rodada</span>
                 <span className="text-sm font-semibold">{state.currentDay} / 10</span>
               </div>
             </div>
          )}

          <div className="flex items-center gap-3">
            {state.phase === 'setup' && (
              <div className="flex items-center gap-3">
                <input 
                  type="text" 
                  value={themeInput}
                  onChange={e => setThemeInput(e.target.value)}
                  placeholder="Qual o projeto hoje?"
                  className="w-72 px-4 py-2 bg-white border border-[#E2E8F0] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition-all"
                />
                <button 
                  onClick={generateBacklog}
                  disabled={isLoading}
                  className="bg-[#2563EB] hover:bg-blue-700 disabled:bg-slate-300 text-white px-6 py-2 rounded-md text-sm font-semibold transition-all shadow-sm flex items-center gap-2"
                >
                  {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Gerar Projeto
                </button>
              </div>
            )}

            {state.phase === 'sprint_planning' && (
              <button 
                onClick={startSprint}
                className="bg-[#2563EB] hover:bg-blue-700 text-white px-6 py-2 rounded-md text-sm font-semibold transition-all"
              >
                Iniciar Sprint
              </button>
            )}

            {state.phase === 'working' && (
              <button 
                onClick={simulateRound}
                disabled={isLoading}
                className="bg-[#2563EB] hover:bg-blue-700 disabled:bg-slate-300 text-white px-6 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2"
              >
                {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Próxima Rodada ►'}
              </button>
            )}

            {state.phase !== 'setup' && (
              <button 
                onClick={resetAll}
                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                title="Sair do simulador"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main Dev Console */}
      <main className="flex-1 flex overflow-hidden">
        {/* Kanban Stage */}
        <div className="flex-1 overflow-x-auto p-5 flex gap-4 pb-12 custom-scrollbar">
          {state.phase !== 'setup' ? (
            <>
              <Column status="backlog" tasks={state.tasks.filter(t => t.status === 'backlog')} />
              <div className="h-full w-[1px] bg-slate-100 mx-2" />
              <Column status="todo" tasks={state.tasks.filter(t => t.status === 'todo')} />
              <Column status="in_progress" tasks={state.tasks.filter(t => t.status === 'in_progress')} />
              <Column status="review" tasks={state.tasks.filter(t => t.status === 'review')} />
              <Column status="done" tasks={state.tasks.filter(t => t.status === 'done')} />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center pb-24">
              <motion.div 
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="w-24 h-24 bg-blue-50 rounded-[40px] flex items-center justify-center mb-8 border-2 border-dashed border-blue-200"
              >
                <Terminal className="w-10 h-10 text-blue-500 opacity-60" />
              </motion.div>
              <h2 className="text-3xl font-black text-slate-800 mb-4 tracking-tight uppercase">DevSim Simulator</h2>
              <p className="text-slate-500 max-w-lg mx-auto mb-10 leading-relaxed font-medium">
                Simule o dia a dia de um time ágil. Defina o objetivo, gere o backlog e gerencie a equipe enquanto a IA simula o progresso real.
              </p>
              
              <div className="w-full max-w-2xl grid grid-cols-2 gap-4">
                {[
                  { title: "SaaS de Logística", icon: "📦" },
                  { title: "Rede Social Gastronômica", icon: "🍕" },
                  { title: "EduTech Gamificado", icon: "🎓" },
                  { title: "Fintech para Minimalistas", icon: "💰" }
                ].map(idea => (
                  <button 
                    key={idea.title}
                    onClick={() => setThemeInput(idea.title)}
                    className="group p-5 bg-white border border-slate-200 rounded-2xl text-sm font-semibold text-slate-600 hover:border-slate-800 hover:text-slate-900 transition-all text-left flex items-center gap-4 hover:shadow-xl hover:shadow-slate-100 active:scale-[0.98]"
                  >
                    <span className="text-2xl grayscale group-hover:grayscale-0 transition-all">{idea.icon}</span>
                    {idea.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Log Console */}
        <aside className="w-[300px] flex flex-col gap-5 p-5 overflow-hidden shrink-0 border-l border-[#E2E8F0]">
          <div className="bg-white rounded-lg border border-[#E2E8F0] p-4 flex flex-col h-1/3 shadow-sm">
            <h3 className="font-bold text-[12px] text-[#2563EB] uppercase mb-3">Feedback do Cliente (IA)</h3>
            <div className="flex-1 overflow-y-auto text-xs leading-relaxed text-[#64748B] italic">
              {state.history.find(h => h.includes('Sistema:'))?.replace('Sistema:', '') || "Aguardando feedback da primeira rodada..."}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-[#E2E8F0] p-4 flex flex-col flex-1 shadow-sm overflow-hidden">
            <h3 className="font-bold text-[12px] text-[#2563EB] uppercase mb-3">Linha do Tempo</h3>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {state.history.map((log, i) => (
                <div key={i} className="p-2 bg-[#F8FAFC] rounded border-l-2 border-[#2563EB] text-[11px] leading-tight">
                  {log}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-[#E2E8F0] p-4 shadow-sm">
            <h3 className="font-bold text-[12px] text-[#2563EB] uppercase mb-3 text-center">Equipe</h3>
            <div className="flex justify-center gap-2">
              {TEAM_MEMBERS.map(m => (
                <div key={m} className="w-8 h-8 rounded-full bg-[#CBD5E1] text-[10px] flex items-center justify-center font-bold" title={m}>
                  {m.charAt(0)}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>

      {/* Standup Modal */}
      <AnimatePresence>
        {state.phase === 'standup' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 30, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-100"
            >
              <div className="p-10">
                <div className="flex items-center gap-5 mb-10">
                  <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-200 -rotate-3">
                    <MessageSquare className="w-8 h-8" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Daily Stand-up</h2>
                    <p className="text-sm font-medium text-slate-400">Reunião de alinhamento do Dia {state.currentDay}</p>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-2xl p-6 mb-10 border border-slate-100 relative group overflow-hidden max-h-[400px] overflow-y-auto custom-scrollbar">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Terminal className="w-32 h-32" />
                  </div>
                  <div className="relative z-10 space-y-6">
                    {state.standupDialogues?.map((d, i) => (
                      <div key={i} className="flex gap-4 items-start">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 font-bold shadow-sm">
                          {d.member.charAt(0)}
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">{d.member}</p>
                          <div className="text-slate-700 text-sm leading-relaxed font-medium bg-white p-3 rounded-lg border border-slate-200 shadow-sm italic">
                            "{d.speech}"
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <button 
                    onClick={nextIteration}
                    className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-3 active:scale-95 shadow-xl shadow-slate-200 group"
                  >
                    CONTINUAR PARA O PRÓXIMO DIA 
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                  <p className="text-[10px] text-center text-slate-400 font-bold uppercase tracking-widest">
                    Pressione para atualizar o board para o dia {state.currentDay + 1}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0,0,0,0.2);
        }
        aside .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
        }
      `}</style>
    </div>
  );
}

