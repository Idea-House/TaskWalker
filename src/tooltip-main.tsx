import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import TooltipApp from './TooltipApp';

createRoot(document.getElementById('root')!).render(<StrictMode><TooltipApp /></StrictMode>);
