<script lang="ts">
	import { cn } from "../../../utils.js";
	import { Streamdown, type StreamdownProps } from "streamdown-svelte";
	import { MediaQuery } from "svelte/reactivity";
 import { markdownLink } from "../../../markdown.js";
	import type { HTMLAttributes } from "svelte/elements";

	// Import Shiki themes
	import githubLightDefault from "@shikijs/themes/github-light-default";
	import githubDarkDefault from "@shikijs/themes/github-dark-default";
	import { code } from "@streamdown-svelte/code";

	type Props = {
		content: string;
    streaming?: boolean;
 resolveFile?: ((url: string) => string | undefined) | undefined;
		id?: string;
		class?: string;
	} & Omit<StreamdownProps, "content" | "class"> &
		Omit<HTMLAttributes<HTMLDivElement>, "content">;

	let { content, id, class: className, resolveFile, streaming = false, ...restProps }: Props = $props();
	const reducedMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
	const dark = new MediaQuery("(prefers-color-scheme: dark)");
 let currentTheme = $derived(
		dark.current ? "github-dark-default" : "github-light-default"
	);
</script>

<div {id} class={cn(className)} {...restProps}>
	<Streamdown
		{content}
    isAnimating={streaming && !reducedMotion.current}
    animated={{ animation: "fadeIn", stagger: 0 }}
		class="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
		shikiTheme={currentTheme}
		baseTheme="shadcn"
    theme={{paragraph:{base:"text-inherit"}, h1:{base:"text-inherit"}, h2:{base:"text-inherit"}, h3:{base:"text-inherit"}, h4:{base:"text-inherit"}, h5:{base:"text-inherit"}, h6:{base:"text-inherit"}, ul:{base:"text-inherit"}, ol:{base:"text-inherit"}, strong:{base:"text-inherit"}, blockquote:{base:"text-inherit"}}}
		shikiThemes={{
			"github-light-default": githubLightDefault,
			"github-dark-default": githubDarkDefault
		}}
		plugins={{ code }}
 skipHtml
 disallowedElements={["img", "iframe", "video", "audio", "object", "embed"]}
 allowedLinkPrefixes={["*"]}
 allowedImagePrefixes={[]}
 urlTransform={(url, key) => key === "href" ? (markdownLink(url) ?? resolveFile?.(url) ?? null) : null}
 linkSafety={{ enabled: false }}
 controls={false}
	>
    {#snippet strong({ children })}<strong>{@render children()}</strong>{/snippet}
    {#snippet link({ token, children })}
      {@const href = markdownLink(token.href) ?? resolveFile?.(token.href)}
      {#if href}<a {href} target="_blank" rel="noopener noreferrer" class="underline underline-offset-2 wrap-anywhere">{@render children()}</a>{:else}<span>{@render children()}</span>{/if}
    {/snippet}
  </Streamdown>
</div>
