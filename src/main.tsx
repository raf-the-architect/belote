import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

const el = document.getElementById('root')!;
createRoot(el).render(<App />);
