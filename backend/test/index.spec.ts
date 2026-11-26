import { describe, it, expect } from 'vitest';
import worker from '../src/index';

describe('Worker boundary', () => {
	it('validates login input before attempting database access', async () => {
		const response = await worker.fetch(new Request('https://lac.example/api/auth/login', {
			method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({email:'invalid', password:'long password'}),
		}), {DATABASE_URL:'postgresql://fake:fake@example.test/fake'});
		expect(response.status).toBe(400);
	});
	it('allows sign-out when no current session exists', async () => {
		const response = await worker.fetch(new Request('https://lac.example/api/auth/logout', {method:'POST'}),
			{DATABASE_URL:'postgresql://fake:fake@example.test/fake'});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({signedOut:true});
	});
	it('reports health without secrets and does not cache responses', async () => {
		const response = await worker.fetch(new Request('https://lac.example/health'), {});
		expect(await response.json()).toEqual({ status: 'ok' });
		expect(response.headers.get('cache-control')).toBe('no-store');
	});
	it('fails closed without database configuration or a valid session', async () => {
		const req = new Request('https://lac.example/api/dashboard');
		expect((await worker.fetch(req, {})).status).toBe(503);
		expect(
			(
				await worker.fetch(req, {
					DATABASE_URL: 'postgresql://fake:fake@example.test/fake',
				})
			).status,
		).toBe(401);
	});
	it('only allows cross-origin browser requests from the configured frontend', async () => {
		const env = { FRONTEND_ORIGIN: 'https://lac.example' };
		const req = (origin: string) =>
			new Request('https://api.example/api/chat', {
				method: 'OPTIONS',
				headers: { Origin: origin },
			});
		expect((await worker.fetch(req('https://evil.example'), env)).status).toBe(403);
		const allowed = await worker.fetch(req(env.FRONTEND_ORIGIN), env);
		expect(allowed.status).toBe(204);
		expect(allowed.headers.get('access-control-allow-origin')).toBe(env.FRONTEND_ORIGIN);
	});
});

describe('Workspace permissions', () => {
	const env = { DATABASE_URL: 'postgresql://test:test@example.test/test', ENABLE_DEMO_DATA: 'true' };
	const request = (op: string, data: object) =>
		new Request('https://api.example/api/workspace/action', {
			method: 'POST',
			headers: { Authorization: 'Bearer ' + 'a'.repeat(64), 'Content-Type': 'application/json' },
			body: JSON.stringify({ op, data }),
		});

	it('never sends a demo reset or login credential mutation to SQL for a student', async () => {
		const { vi } = await import('vitest');
		const fetch = vi.fn(async () =>
			Response.json({
				fields: ['user_id', 'student_id', 'instructor_id', 'role', 'name'].map((name) => ({ name, dataTypeID: 25 })),
				rows: [['2', '5', null, 'student', 'Alex Demo']],
			}),
		);
		vi.stubGlobal('fetch', fetch);
		try {
			expect((await worker.fetch(request('demo-empty', { confirm: 'demo-empty' }), env)).status).toBe(403);
			expect((await worker.fetch(request('set-login', { id: '5', role: 'student', email: 'alex@example.test', password: 'a long password' }), env)).status).toBe(403);
			expect(fetch).toHaveBeenCalledTimes(2);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('rejects invalid booking coordinates before calling the database mutation', async () => {
		const { vi } = await import('vitest');
		const fetch = vi.fn(async () =>
			Response.json({
				fields: ['user_id', 'student_id', 'instructor_id', 'role', 'name'].map((name) => ({ name, dataTypeID: 25 })),
				rows: [['2', '5', null, 'student', 'Alex Demo']],
			}),
		);
		vi.stubGlobal('fetch', fetch);
		try {
			expect((await worker.fetch(request('book', { booking: { staff: 'staff:1', service: '1', start: 1, pickup: -1 } }), env)).status).toBe(
				400,
			);
			expect(fetch).toHaveBeenCalledTimes(1);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
