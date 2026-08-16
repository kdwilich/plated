import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Runs Vite's CSS pipeline over <style lang="scss"> blocks
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter()
	}
};

export default config;
