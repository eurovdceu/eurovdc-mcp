#!/usr/bin/env node
/**
 * EuroVDC MCP Server (stdio) — Claude Desktop / Cursor
 *
 * Env:
 *   EUROVDC_BASE_URL  default https://www.eurovdc.eu
 *   EUROVDC_LANG      default en (en|tr|de|bg)
 *   EUROVDC_AGENT_API_KEY  optional partner key (evdc_...) for higher rate limits
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

const BASE = (process.env.EUROVDC_BASE_URL || 'https://www.eurovdc.eu').replace(/\/$/, '');
const LANG = process.env.EUROVDC_LANG || 'en';
const API = `${BASE}/${LANG}/api`;
const AGENT_KEY = (process.env.EUROVDC_AGENT_API_KEY || '').trim();

function apiHeaders(extra = {}) {
	const headers = { Accept: 'application/json', ...extra };
	if (AGENT_KEY.startsWith('evdc_')) {
		headers.Authorization = `Bearer ${AGENT_KEY}`;
	}
	return headers;
}

const TOOLS = [
	{
		name: 'search_domain',
		description: 'Check domain availability and EUR pricing for a TLD.',
		inputSchema: {
			type: 'object',
			properties: {
				domain: { type: 'string', description: 'SLD or full domain' },
				tld: { type: 'string', default: 'com' },
			},
			required: ['domain'],
		},
	},
	{
		name: 'recommend_server',
		description: 'AI VPS/cloud plan recommendation from workload description.',
		inputSchema: {
			type: 'object',
			properties: {
				prompt: { type: 'string' },
			},
			required: ['prompt'],
		},
	},
	{
		name: 'list_products',
		description: 'List hosting/VPS/SSL/email/VPN products with pricing and purchase URLs.',
		inputSchema: {
			type: 'object',
			properties: {
				type: {
					type: 'string',
					enum: ['all', 'hostingaccount', 'server', 'ssl', 'email', 'vpn', 'other'],
					default: 'all',
				},
			},
		},
	},
	{
		name: 'list_tlds',
		description: 'List all TLDs with EUR prices.',
		inputSchema: { type: 'object', properties: {} },
	},
	{
		name: 'whois_lookup',
		description: 'WHOIS lookup for a domain.',
		inputSchema: {
			type: 'object',
			properties: { domain: { type: 'string' } },
			required: ['domain'],
		},
	},
	{
		name: 'ai_domain_suggest',
		description: 'AI domain name suggestions from business description.',
		inputSchema: {
			type: 'object',
			properties: { prompt: { type: 'string' } },
			required: ['prompt'],
		},
	},
	{
		name: 'agent_domain_fields',
		description: 'Domain additional fields for ccTLDs (.tr etc.) before agent_cart_add.',
		inputSchema: {
			type: 'object',
			properties: { tld: { type: 'string', description: 'TLD without dot; omit for all' } },
		},
	},
	{
		name: 'agent_cart_add',
		description: 'Create/update agent cart; returns checkout_url (24h TTL).',
		inputSchema: {
			type: 'object',
			properties: {
				product_id: { type: 'integer' },
				billing_cycle: { type: 'string' },
				domain: { type: 'string' },
				domain_action: { type: 'string', enum: ['register', 'transfer'] },
				period: { type: 'integer' },
				eppcode: { type: 'string' },
				additional_fields: { type: 'object', additionalProperties: true },
				cart_id: { type: 'string' },
			},
		},
	},
	{
		name: 'agent_cart_get',
		description: 'Get agent cart summary by cart_id.',
		inputSchema: {
			type: 'object',
			properties: { cart_id: { type: 'string' } },
			required: ['cart_id'],
		},
	},
	{
		name: 'agent_checkout_quote',
		description: 'Create 15-minute locked price quote from agent cart.',
		inputSchema: {
			type: 'object',
			properties: { cart_id: { type: 'string' } },
			required: ['cart_id'],
		},
	},
	{
		name: 'agent_checkout_prepare',
		description: 'Create Stripe Checkout Session for quote (Phase 2); returns stripe_checkout_url.',
		inputSchema: {
			type: 'object',
			properties: { quote_id: { type: 'string' } },
			required: ['quote_id'],
		},
	},
	{
		name: 'agent_checkout_status',
		description: 'Poll quote payment status (syncs with Stripe).',
		inputSchema: {
			type: 'object',
			properties: { quote_id: { type: 'string' } },
			required: ['quote_id'],
		},
	},
	{
		name: 'agent_checkout_pay',
		description: 'Pay quote with Stripe Shared Payment Granted Token (Phase 3, spt_...).',
		inputSchema: {
			type: 'object',
			properties: {
				quote_id: { type: 'string' },
				shared_payment_granted_token: { type: 'string' },
			},
			required: ['quote_id', 'shared_payment_granted_token'],
		},
	},
	{
		name: 'agent_checkout_fulfill',
		description: 'Create order from paid quote (requires logged-in browser session).',
		inputSchema: {
			type: 'object',
			properties: { quote_id: { type: 'string' } },
			required: ['quote_id'],
		},
	},
];

async function recommendServer(prompt) {
	const { data: catalog } = await axios.get(`${API}/list_products/server`, {
		headers: apiHeaders(),
		timeout: 45000,
	});
	const products = (catalog.message || []).slice(0, 50).map(mapProductForAiServer).filter((p) => p.pid > 0);
	if (!products.length) throw new Error('No server products available');
	const { data } = await axios.post(`${API}/ai_server_suggest`, { prompt, products }, {
		headers: apiHeaders({ 'Content-Type': 'application/json' }),
		timeout: 60000,
	});
	return data;
}

function mapProductForAiServer(product) {
	const pricing = product.pricing?.EUR || {};
	let price = 0;
	for (const cycle of ['monthly', 'quarterly', 'semiannually', 'annually']) {
		const val = parseFloat(pricing[cycle]);
		if (val > 0) { price = val; break; }
	}
	const name = product.name || '';
	const desc = (product.description || '').replace(/<[^>]+>/g, ' ');
	const hay = `${name} ${desc}`;
	const cpu = hay.match(/(\d+)\s*v?cpu/i);
	const ram = hay.match(/(\d+)\s*gb?\s*ram/i);
	const hdd = hay.match(/(\d+)\s*gb(?:\s*(?:ssd|nvme|disk|storage|hdd))?/i);
	return {
		pid: Number(product.pid) || 0,
		name,
		cpu: cpu ? Number(cpu[1]) : 0,
		ram: ram ? Number(ram[1]) : 0,
		hdd: hdd ? Number(hdd[1]) : 0,
		price,
		usecase: desc.trim().slice(0, 120),
		os: '',
		management: '',
	};
}

async function callEuroVdcApi(name, args) {
	const a = args || {};
	switch (name) {
		case 'search_domain': {
			const { data } = await axios.post(`${API}/search_domain`, new URLSearchParams({
				domain: a.domain,
				tld: a.tld || 'com',
			}), { headers: apiHeaders(), timeout: 45000 });
			return data;
		}
		case 'recommend_server':
			return recommendServer(a.prompt);
		case 'list_products': {
			const type = a.type || 'all';
			const { data } = await axios.get(`${API}/list_products/${encodeURIComponent(type)}`, {
				headers: apiHeaders(),
				timeout: 45000,
			});
			return data;
		}
		case 'list_tlds': {
			const { data } = await axios.get(`${API}/tlds`, { headers: apiHeaders(), timeout: 45000 });
			return data;
		}
		case 'whois_lookup': {
			const { data } = await axios.post(`${API}/whois`, new URLSearchParams({ domain: a.domain }), {
				headers: apiHeaders(),
				timeout: 45000,
			});
			return data;
		}
		case 'ai_domain_suggest': {
			const { data } = await axios.post(`${API}/ai_suggest`, new URLSearchParams({ prompt: a.prompt }), {
				headers: apiHeaders(),
				timeout: 60000,
			});
			return data;
		}
		case 'agent_domain_fields': {
			const qs = a.tld ? `?tld=${encodeURIComponent(a.tld)}` : '';
			const { data } = await axios.get(`${API}/agent_domain_fields${qs}`, {
				headers: apiHeaders(),
				timeout: 45000,
			});
			return data;
		}
		case 'agent_cart_add': {
			const body = { ...a };
			delete body.lang;
			const { data } = await axios.post(`${API}/agent_cart_add`, body, {
				headers: apiHeaders({ 'Content-Type': 'application/json' }),
				timeout: 45000,
			});
			return data;
		}
		case 'agent_cart_get': {
			const { data } = await axios.get(`${API}/agent_cart/${encodeURIComponent(a.cart_id)}`, {
				headers: apiHeaders(),
				timeout: 45000,
			});
			return data;
		}
		case 'agent_checkout_quote': {
			const { data } = await axios.post(`${API}/agent_checkout_quote`, { cart_id: a.cart_id }, {
				headers: apiHeaders({ 'Content-Type': 'application/json' }),
				timeout: 45000,
			});
			return data;
		}
		case 'agent_checkout_prepare': {
			const { data } = await axios.post(`${API}/agent_checkout_prepare`, { quote_id: a.quote_id }, {
				headers: apiHeaders({ 'Content-Type': 'application/json' }),
				timeout: 45000,
			});
			return data;
		}
		case 'agent_checkout_status': {
			const { data } = await axios.get(`${API}/agent_checkout_status/${encodeURIComponent(a.quote_id)}`, {
				headers: apiHeaders(),
				timeout: 45000,
			});
			return data;
		}
		case 'agent_checkout_pay': {
			const { data } = await axios.post(`${API}/agent_checkout_pay`, {
				quote_id: a.quote_id,
				shared_payment_granted_token: a.shared_payment_granted_token,
			}, {
				headers: apiHeaders({ 'Content-Type': 'application/json' }),
				timeout: 45000,
			});
			return data;
		}
		case 'agent_checkout_fulfill': {
			const { data } = await axios.post(`${API}/agent_checkout_fulfill`, { quote_id: a.quote_id }, {
				headers: apiHeaders({ 'Content-Type': 'application/json' }),
				timeout: 45000,
			});
			return data;
		}
		default:
			throw new Error(`Unknown tool: ${name}`);
	}
}

const server = new Server(
	{ name: 'eurovdc', version: '1.2.0' },
	{ capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const { name, arguments: args } = request.params;
	try {
		const result = await callEuroVdcApi(name, args);
		const text = JSON.stringify(result, null, 2);
		const isError = result && (result.status === 'error' || result.code === 0);
		return { content: [{ type: 'text', text }], isError: !!isError };
	} catch (err) {
		const message = err.response?.data ? JSON.stringify(err.response.data) : err.message;
		return { content: [{ type: 'text', text: message }], isError: true };
	}
});

const transport = new StdioServerTransport();
await server.connect(transport);
