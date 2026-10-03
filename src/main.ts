import '@fontsource-variable/inter';
import '@fontsource/vt323';
import '@fontsource/share-tech-mono';
import './styles/base.css';
import './styles/landing.css';
import './styles/screen.css';
import './styles/hud.css';
import './styles/terminal.css';
import './styles/overlays.css';
import { App } from './app';

new App(document.getElementById('app')!).start();
