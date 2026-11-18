// Sobe o servidor (API + SQLite) e o Vite juntos, com a saída de cada um prefixada.
// Ctrl+C derruba os dois.
import { spawn, type ChildProcess } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const processos: Array<[string, string, ChildProcess]> = [];

function subir(nome: string, cor: string, args: string[]) {
  // No Windows o npm é um .cmd e precisa de shell; os argumentos aqui são fixos, sem entrada do usuário.
  const opcoes = { stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'], env: { ...process.env, BORA_SEM_WEB: '1' } };
  const filho = process.platform === 'win32' ? spawn(`${npm} ${args.join(' ')}`, { ...opcoes, shell: true }) : spawn(npm, args, opcoes);
  const prefixo = `\x1b[${cor}m[${nome}]\x1b[0m `;
  const escrever = (fluxo: NodeJS.WriteStream) => (dados: Buffer) => {
    for (const linha of dados.toString().split(/\r?\n/)) if (linha.trim()) fluxo.write(prefixo + linha + '\n');
  };
  filho.stdout?.on('data', escrever(process.stdout));
  filho.stderr?.on('data', escrever(process.stderr));
  filho.on('exit', (codigo) => {
    console.log(`${prefixo}parou (código ${codigo ?? 'desconhecido'})`);
    encerrar();
  });
  processos.push([nome, cor, filho]);
}

let encerrando = false;
function encerrar() {
  if (encerrando) return;
  encerrando = true;
  for (const [, , p] of processos) {
    if (p.exitCode !== null || p.pid === undefined) continue;
    // No Windows, matar o shell deixa o node filho vivo: derruba a árvore inteira.
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
    else p.kill();
  }
  setTimeout(() => process.exit(0), 300);
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);

subir('api', '36', ['run', 'dev', '--workspace', '@bora-mapear/server']);
subir('web', '35', ['run', 'dev', '--workspace', '@bora-mapear/web']);
console.log('\nBora Mapear em modo de desenvolvimento: abra http://127.0.0.1:5173\n');
