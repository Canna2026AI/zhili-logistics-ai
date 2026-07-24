import '@zhili/ui/styles.css';
import type { Preview } from '@storybook/react-vite';

const preview: Preview = {
  parameters: {
    layout: 'centered',
    controls: { expanded: true },
    a11y: { test: 'error' },
    backgrounds: {
      default: 'page',
      values: [
        { name: 'page', value: '#F8FAFC' },
        { name: 'surface', value: '#FFFFFF' },
        { name: 'nav', value: '#1F2937' },
      ],
    },
  },
};

export default preview;
