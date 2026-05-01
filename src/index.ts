#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const TOKEN = process.env.KABEHUB_TOKEN
const BASE_URL = (process.env.KABEHUB_API_URL ?? 'https://www.kabehub.com').replace(/\/$/, '')

async function mcpFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      ...(options.headers as Record<string, string> | undefined),
    },
  })
}

const server = new Server(
  { name: 'kabehub-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'create_thread',
      description: 'KabeHubに新しい壁打ちスレッドを作成します。スレッドIDを返します。',
      inputSchema: {
        type: 'object' as const,
        properties: {
          title: { type: 'string', description: 'スレッドのタイトル' },
          system_prompt: { type: 'string', description: 'システムプロンプト（任意）' },
          folder_name: { type: 'string', description: 'フォルダ名（任意）' },
          genre: { type: 'string', description: 'ジャンル（任意）' },
        },
        required: ['title'],
      },
    },
    {
      name: 'add_message',
      description: '指定スレッドにメッセージを追加します。会話ログをKabeHubに保存するために使います。',
      inputSchema: {
        type: 'object' as const,
        properties: {
          thread_id: { type: 'string', description: 'スレッドID（create_threadで取得）' },
          role: {
            type: 'string',
            enum: ['user', 'assistant'],
            description: 'メッセージの送信者',
          },
          content: { type: 'string', description: 'メッセージ本文' },
          provider: {
            type: 'string',
            description: 'AIプロバイダ名（例: claude, gemini, openai）',
          },
        },
        required: ['thread_id', 'role', 'content'],
      },
    },
    {
      name: 'list_threads',
      description: '自分のKabeHubスレッド一覧を最新順で最大100件取得します。',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  if (name === 'create_thread') {
    const res = await mcpFetch('/api/mcp/threads', {
      method: 'POST',
      body: JSON.stringify(args),
    })
    const json = await res.json() as Record<string, unknown>
    if (!res.ok) throw new Error((json.error as string | undefined) ?? 'Failed to create thread')
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(json.thread, null, 2) }],
    }
  }

  if (name === 'add_message') {
    const { thread_id, ...body } = args as {
      thread_id: string
      role: 'user' | 'assistant'
      content: string
      provider?: string
    }
    const res = await mcpFetch(`/api/mcp/threads/${thread_id}/messages`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const json = await res.json() as Record<string, unknown>
    if (!res.ok) throw new Error((json.error as string | undefined) ?? 'Failed to add message')
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(json.message, null, 2) }],
    }
  }

  if (name === 'list_threads') {
    const res = await mcpFetch('/api/mcp/threads')
    const json = await res.json() as Record<string, unknown>
    if (!res.ok) throw new Error((json.error as string | undefined) ?? 'Failed to list threads')
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(json.threads, null, 2) }],
    }
  }

  throw new Error(`Unknown tool: ${name}`)
})

async function main() {
  if (!TOKEN) {
    process.stderr.write('Error: KABEHUB_TOKEN environment variable is required\n')
    process.exit(1)
  }
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err: Error) => {
  process.stderr.write(`Fatal: ${err.message}\n`)
  process.exit(1)
})
