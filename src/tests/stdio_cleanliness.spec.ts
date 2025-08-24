import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'

function captureStdout(cmd: string, args: string[], opts: { timeoutMs?: number } = {}): Promise<{ stdout: string, stderr: string }> {
  const timeoutMs = opts.timeoutMs ?? 500
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* ignore */ }
    }, timeoutMs)
    child.stdout.on('data', (d: Buffer) => { out += d.toString() })
    child.stderr.on('data', (d: Buffer) => { err += d.toString() })
    child.on('exit', () => { clearTimeout(timer); resolve({ stdout: out, stderr: err }) })
    child.on('error', () => { clearTimeout(timer); resolve({ stdout: out, stderr: err }) })
  })
}

describe('stdio cleanliness for MCP', () => {
  it('npm run --silent dev does not emit stdout preamble', async () => {
    const { stdout } = await captureStdout('npm', ['run', '--silent', 'dev'], { timeoutMs: 500 })
    expect(stdout).toBe('')
  })

  it('node dist/mcp.js keeps stdout clean on startup', async () => {
    const { stdout } = await captureStdout('node', ['dist/mcp.js'], { timeoutMs: 500 })
    expect(stdout).toBe('')
  })
})

