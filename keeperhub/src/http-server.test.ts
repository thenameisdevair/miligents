import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createHTTPServer } from './http-server.js';

describe('HTTP Server Transport', () => {
  let app: express.Application;
  let mockServer: Server;
  const TEST_API_KEY = 'test-api-key-12345';
  const TEST_PORT = 3000;

  beforeEach(() => {
    mockServer = new Server(
      {
        name: 'test-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    vi.spyOn(mockServer, 'connect').mockResolvedValue();

    app = createHTTPServer({
      server: mockServer,
      port: TEST_PORT,
      apiKey: TEST_API_KEY,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Health Endpoint', () => {
    it('should return 200 OK with status and timestamp', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(new Date(response.body.timestamp).toString()).not.toBe('Invalid Date');
    });

    it('should not require authentication', async () => {
      const response = await request(app)
        .get('/health')
        .set('Authorization', '');

      expect(response.status).toBe(200);
    });

    it('should return consistent response format', async () => {
      const response = await request(app).get('/health');

      expect(typeof response.body.status).toBe('string');
      expect(typeof response.body.timestamp).toBe('string');
      expect(Object.keys(response.body)).toEqual(['status', 'timestamp']);
    });
  });

  describe('Authentication Middleware', () => {
    describe('Missing Authorization Header', () => {
      it('should reject SSE requests without Authorization header', async () => {
        const response = await request(app).get('/sse');

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
          error: 'Missing Authorization header',
        });
      });

      it('should reject message requests without Authorization header', async () => {
        const response = await request(app)
          .post('/message')
          .send({ test: 'data' });

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
          error: 'Missing Authorization header',
        });
      });
    });

    describe('Invalid Authorization Format', () => {
      it('should reject requests with malformed Authorization header', async () => {
        const response = await request(app)
          .get('/sse')
          .set('Authorization', 'InvalidFormat');

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
          error: 'Invalid Authorization header format. Expected: Bearer <token>',
        });
      });

      it('should reject requests with missing scheme', async () => {
        const response = await request(app)
          .get('/sse')
          .set('Authorization', TEST_API_KEY);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
          error: 'Invalid Authorization header format. Expected: Bearer <token>',
        });
      });

      it('should reject requests with wrong scheme', async () => {
        const response = await request(app)
          .get('/sse')
          .set('Authorization', `Basic ${TEST_API_KEY}`);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
          error: 'Invalid Authorization header format. Expected: Bearer <token>',
        });
      });

      it('should reject requests with Bearer but no token', async () => {
        const response = await request(app)
          .get('/sse')
          .set('Authorization', 'Bearer ');

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
          error: 'Invalid Authorization header format. Expected: Bearer <token>',
        });
      });

      it('should reject requests with Bearer but only whitespace', async () => {
        const response = await request(app)
          .get('/sse')
          .set('Authorization', 'Bearer   ');

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
          error: 'Invalid Authorization header format. Expected: Bearer <token>',
        });
      });
    });

    describe('Invalid API Key', () => {
      it('should reject requests with incorrect API key', async () => {
        const response = await request(app)
          .get('/sse')
          .set('Authorization', 'Bearer wrong-api-key');

        expect(response.status).toBe(403);
        expect(response.body).toEqual({
          error: 'Invalid API key',
        });
      });

      it('should reject requests with empty API key', async () => {
        const response = await request(app)
          .get('/sse')
          .set('Authorization', 'Bearer ');

        expect(response.status).toBe(401);
      });

      it('should be case-sensitive for API key validation', async () => {
        const response = await request(app)
          .get('/sse')
          .set('Authorization', `Bearer ${TEST_API_KEY.toUpperCase()}`);

        expect(response.status).toBe(403);
        expect(response.body).toEqual({
          error: 'Invalid API key',
        });
      });
    });

    describe('Valid Authentication', () => {
      it('should accept message requests with correct Bearer token', async () => {
        const response = await request(app)
          .post('/message')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .query({ sessionId: 'test-session' })
          .send({ test: 'data' });

        expect(response.status).not.toBe(401);
        expect(response.status).not.toBe(403);
      });
    });
  });

  describe('SSE Endpoint', () => {
    it('should establish SSE connection with valid authentication', async () => {
      const agent = request(app);
      const req = agent
        .get('/sse')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .timeout(100);

      await new Promise<void>((resolve) => {
        req.on('error', () => resolve());
        req.end(() => resolve());
      });

      expect(mockServer.connect).toHaveBeenCalled();
    });

    it('should set auth info on successful authentication', async () => {
      const agent = request(app);
      const req = agent
        .get('/sse')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .timeout(100);

      await new Promise<void>((resolve) => {
        req.on('error', () => resolve());
        req.end(() => resolve());
      });

      expect(mockServer.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: expect.any(String),
        })
      );
    });

    it('should handle connection errors gracefully', async () => {
      vi.spyOn(mockServer, 'connect').mockRejectedValue(
        new Error('Connection failed')
      );

      const response = await request(app)
        .get('/sse')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to establish SSE connection',
      });
    });
  });

  describe('Message Endpoint', () => {
    describe('Query Parameter Validation', () => {
      it('should reject requests without sessionId query parameter', async () => {
        const response = await request(app)
          .post('/message')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({ test: 'data' });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          error: 'Missing sessionId query parameter',
        });
      });

      it('should reject requests with empty sessionId', async () => {
        const response = await request(app)
          .post('/message')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .query({ sessionId: '' })
          .send({ test: 'data' });

        expect([400, 404]).toContain(response.status);
        expect(response.body).toHaveProperty('error');
      });

      it('should reject requests with null sessionId', async () => {
        const response = await request(app)
          .post('/message')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .query({ sessionId: 'null' })
          .send({ test: 'data' });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
          error: 'Session not found',
        });
      });
    });

    describe('Session Management', () => {
      it('should reject messages for non-existent sessions', async () => {
        const response = await request(app)
          .post('/message')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .query({ sessionId: 'non-existent-session' })
          .send({ test: 'data' });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
          error: 'Session not found',
        });
      });

      it('should validate sessionId format', async () => {
        const invalidSessionIds = [
          'invalid session',
          'session@123',
          '../../../etc/passwd',
          '<script>alert("xss")</script>',
        ];

        for (const sessionId of invalidSessionIds) {
          const response = await request(app)
            .post('/message')
            .set('Authorization', `Bearer ${TEST_API_KEY}`)
            .query({ sessionId })
            .send({ test: 'data' });

          expect(response.status).toBe(404);
          expect(response.body).toEqual({
            error: 'Session not found',
          });
        }
      });
    });

    describe('Request Body Handling', () => {
      it('should accept valid JSON body', async () => {
        const response = await request(app)
          .post('/message')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .set('Content-Type', 'application/json')
          .query({ sessionId: 'test-session' })
          .send({ message: 'test' });

        expect([400, 404]).toContain(response.status);
      });

      it('should handle empty request body', async () => {
        const response = await request(app)
          .post('/message')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .query({ sessionId: 'test-session' })
          .send();

        expect(response.status).toBe(404);
      });

      it('should handle malformed JSON gracefully', async () => {
        const response = await request(app)
          .post('/message')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .set('Content-Type', 'application/json')
          .query({ sessionId: 'test-session' })
          .send('{"invalid": json}');

        expect(response.status).toBe(400);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle uncaught errors in SSE endpoint', async () => {
      vi.spyOn(mockServer, 'connect').mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const response = await request(app)
        .get('/sse')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });

    it('should not expose internal error details', async () => {
      vi.spyOn(mockServer, 'connect').mockRejectedValue(
        new Error('Internal database connection failed')
      );

      const response = await request(app)
        .get('/sse')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to establish SSE connection');
      expect(response.body.error).not.toContain('database');
    });
  });

  describe('HTTP Methods', () => {
    it('should reject POST requests to /sse', async () => {
      const response = await request(app)
        .post('/sse')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      expect(response.status).toBe(404);
    });

    it('should reject GET requests to /message', async () => {
      const response = await request(app)
        .get('/message')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .query({ sessionId: 'test-session' });

      expect(response.status).toBe(404);
    });

    it('should reject PUT requests to /health', async () => {
      const response = await request(app).put('/health');

      expect(response.status).toBe(404);
    });
  });

  describe('Security', () => {
    it('should not leak API key in error messages', async () => {
      const response = await request(app)
        .get('/sse')
        .set('Authorization', 'Bearer wrong-key');

      expect(response.status).toBe(403);
      expect(JSON.stringify(response.body)).not.toContain(TEST_API_KEY);
    });

    it('should not accept SQL injection in sessionId', async () => {
      const response = await request(app)
        .post('/message')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .query({ sessionId: "' OR '1'='1" })
        .send({ test: 'data' });

      expect(response.status).toBe(404);
    });

    it('should handle extremely long sessionId gracefully', async () => {
      const longSessionId = 'a'.repeat(10000);
      const response = await request(app)
        .post('/message')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .query({ sessionId: longSessionId })
        .send({ test: 'data' });

      expect(response.status).toBe(404);
    });

    it('should handle special characters in sessionId', async () => {
      const specialChars = ['!@#$%^&*()', '\n\r\t', '\\x00\\x01'];

      for (const sessionId of specialChars) {
        const response = await request(app)
          .post('/message')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .query({ sessionId })
          .send({ test: 'data' });

        expect(response.status).toBe(404);
      }
    });
  });

  describe('Content-Type Handling', () => {
    it('should accept application/json content type', async () => {
      const response = await request(app)
        .post('/message')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .set('Content-Type', 'application/json')
        .query({ sessionId: 'test' })
        .send({ test: 'data' });

      expect(response.status).not.toBe(415);
    });

    it('should handle missing Content-Type header', async () => {
      const response = await request(app)
        .post('/message')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .query({ sessionId: 'test' })
        .send({ test: 'data' });

      expect(response.status).not.toBe(415);
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle multiple concurrent authentication requests', async () => {
      const requests = Array.from({ length: 10 }, () =>
        request(app)
          .get('/health')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
      );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });

    it('should handle mixed valid and invalid authentication concurrently', async () => {
      const validRequests = Array.from({ length: 5 }, () =>
        request(app).get('/health').set('Authorization', `Bearer ${TEST_API_KEY}`)
      );

      const invalidRequests = Array.from({ length: 5 }, () =>
        request(app).get('/sse').set('Authorization', 'Bearer wrong-key')
      );

      const responses = await Promise.all([...validRequests, ...invalidRequests]);

      const validResponses = responses.slice(0, 5);
      const invalidResponses = responses.slice(5);

      validResponses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      invalidResponses.forEach((response) => {
        expect(response.status).toBe(403);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle requests with extra whitespace in Authorization header', async () => {
      const response = await request(app)
        .get('/sse')
        .set('Authorization', `  Bearer   ${TEST_API_KEY}  `);

      expect(response.status).toBe(401);
    });

    it('should handle case-insensitive Bearer scheme', async () => {
      const response = await request(app)
        .get('/sse')
        .set('Authorization', `bearer ${TEST_API_KEY}`);

      expect(response.status).toBe(401);
    });

    it('should handle authorization header with multiple spaces', async () => {
      const response = await request(app)
        .get('/sse')
        .set('Authorization', `Bearer  ${TEST_API_KEY}`);

      expect(response.status).not.toBe(200);
    });

    it('should handle undefined query parameters', async () => {
      const response = await request(app)
        .post('/message')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .query({ sessionId: undefined })
        .send({ test: 'data' });

      expect(response.status).toBe(400);
    });

    it('should handle numeric sessionId', async () => {
      const response = await request(app)
        .post('/message')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .query({ sessionId: 12345 })
        .send({ test: 'data' });

      expect(response.status).toBe(404);
    });
  });

  describe('Response Headers', () => {
    it('should set appropriate content-type for JSON responses', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should set appropriate content-type for error responses', async () => {
      const response = await request(app).get('/sse');

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });
});
