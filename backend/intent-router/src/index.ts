import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import healthRoutes from './routes/health';
import intentRoutes from './routes/intent';
import sessionRoutes from './routes/session';
import { errorHandler } from './middleware/error';
import { requestLogger } from './middleware/telemetry';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://agi-egg.vercel.app', 'https://*.vercel.app']
    : ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));
app.use(requestLogger);

// Routes
app.use('/health', healthRoutes);
app.use('/api/v1/intents', intentRoutes);
app.use('/api/v1/sessions', sessionRoutes);

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Intent Router service running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`GCP Project: ${process.env.GCP_PROJECT_ID}`);
});