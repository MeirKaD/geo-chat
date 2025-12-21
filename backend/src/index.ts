import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import chatRouter from './routes/chat';
import healthRouter from './routes/health';
import { warmMcpConnections } from './services/mcp/status';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Routes
app.use('/api/health', healthRouter);
app.use('/api/chat', chatRouter);

// Initialize MCP connection (non-blocking)
void warmMcpConnections()
  .then((status) => {
    console.log(
      `[MCP] Connected to ${status.serverCount} server(s); ${status.toolCount} tool(s) available: ${status.toolNames.join(
        ', '
      )}`
    );
  })
  .catch((error) => {
    console.error('[MCP] Failed to initialize Bright Data MCP client:', error);
  });

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
