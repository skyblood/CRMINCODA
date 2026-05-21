/**
 * Swagger/OpenAPI docs — served at /api/docs
 * Only available in non-production environments.
 */
import { Router } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const router = Router();

const spec = swaggerJsdoc({
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'CRM Incoda API',
            version: '1.0.0',
            description: 'Internal CRM API — session auth required. External consumers use /api/v1/ with API key.',
        },
        servers: [{ url: '/api', description: 'Local / production' }],
        components: {
            securitySchemes: {
                sessionCookie: { type: 'apiKey', in: 'cookie', name: 'connect.sid' },
                apiKey:        { type: 'apiKey', in: 'header', name: 'X-API-Key' },
            },
        },
        security: [{ sessionCookie: [] }],
    },
    apis: ['./server/routes/*.js'],
});

router.use('/', swaggerUi.serve);
router.get('/', swaggerUi.setup(spec, { customSiteTitle: 'CRM Incoda API Docs' }));
router.get('/json', (_req, res) => res.json(spec));

export default router;
