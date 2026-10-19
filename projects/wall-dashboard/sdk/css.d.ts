// Apps import their stylesheet as text (esbuild `--loader:.css=text`) and pass it to adoptStyle().
declare module '*.css' {
  const css: string;
  export default css;
}
