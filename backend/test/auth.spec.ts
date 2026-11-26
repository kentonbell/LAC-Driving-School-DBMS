import { describe, it, expect, vi } from 'vitest';
import { login, setLogin } from '../src/auth';
import type { SQL } from '../src/index';
import { emailSuggestion, normalizeEmail, validEmail, validPassword } from '../../shared/email';

describe('Email and password validation', () => {
  it('normalizes addresses, rejects malformed addresses, and allows custom domains', () => {
    expect(normalizeEmail(' Alex@School.CA ')).toBe('alex@school.ca');
    for (const email of ['alex', 'a@@b.com', 'a b@gmail.com', 'a@school', 'a@-school.ca', 'a..b@school.ca'])
      expect(validEmail(email)).toBe(false);
    expect(validEmail('alex+lessons@school.ca')).toBe(true);
  });
  it('suggests common mistakes without rejecting unfamiliar domains', () => {
    expect(emailSuggestion('alex@gmial.com')).toBe('alex@gmail.com');
    expect(emailSuggestion('alex@gmail.con')).toBe('alex@gmail.com');
    expect(emailSuggestion('alex@gmailcom')).toBe('alex@gmail.com');
    expect(emailSuggestion('alex@my-school.ca')).toBeUndefined();
  });
  it('rejects short passwords, null bytes, and bcrypt truncation', () => {
    expect(validPassword('short')).toBe(false);
    expect(validPassword('x'.repeat(73))).toBe(false);
    expect(validPassword('é'.repeat(37))).toBe(false);
    expect(validPassword('a long password\0')).toBe(false);
    expect(validPassword('a long passphrase')).toBe(true);
  });
});
describe('Login service', () => {
  it('does not query SQL for malformed emails', async () => {
    const sql = vi.fn();
    await expect(login(sql as unknown as SQL, {email:'invalid',password:'long password'}, 'ip')).rejects.toMatchObject({status:400});
    expect(sql).not.toHaveBeenCalled();
  });
  it('blocks attempts before checking passwords when the account limit is exceeded', async () => {
    const sql = vi.fn().mockResolvedValue([{key:'other',attempts:51}]);
    await expect(login(sql as unknown as SQL, {email:'a@school.ca',password:'long password'}, 'ip')).rejects.toMatchObject({status:429});
    expect(sql).toHaveBeenCalledTimes(1);
  });
  it('returns the same error for wrong passwords and unknown accounts', async () => {
    const sql = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(login(sql as unknown as SQL, {email:'a@school.ca',password:'long password'}, 'ip')).rejects.toMatchObject({status:401,message:'Email or password is incorrect.'});
  });
  it('creates a random session and returns the database-derived role', async () => {
    const user = {id:'3',role:'student',name:'Alex'};
    const sql = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([user]);
    const result = await login(sql as unknown as SQL, {email:' A@School.ca ',password:'long password'}, 'ip');
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(result.user).toEqual(user);
    expect(sql.mock.calls[1]).toContain('a@school.ca');
  });
  it('reports a conflicting login email without exposing SQL errors', async () => {
    const sql = vi.fn().mockRejectedValue({code:'23505'});
    await expect(setLogin(sql as unknown as SQL,'3','a@school.ca','long password')).rejects.toMatchObject({status:409});
  });
});
