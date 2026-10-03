import '@fontsource-variable/inter';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/vt323';
import '@fontsource/share-tech-mono';
import './styles/base.css';
import './styles/page.css';
import './styles/gallery.css';
import './styles/crt.css';
import './styles/term.css';
import './styles/overlays.css';
import { App } from './app';

new App(document.getElementById('app')!).start();
