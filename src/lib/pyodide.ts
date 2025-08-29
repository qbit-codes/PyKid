// src/lib/pyodide.ts
let boot: Promise<{
  pyodide: any;
  onStdout: (cb: (s: string) => void) => void;
  onStderr: (cb: (s: string) => void) => void;
  run: (code: string) => Promise<void>;
}> | null = null;

export async function usePyodide() {
  if (boot) return boot;

  boot = (async () => {
    // 1) Pyodide script
    if (!(window as any).loadPyodide) {
      await new Promise<void>((res) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/pyodide/v0.28.2/full/pyodide.js?v=0282';
        s.onload = () => res();
        document.head.appendChild(s);
      });
    }

    // 2) Engine
    const pyodide = await (window as any).loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.28.2/full/'
    });

    // 3) Eski import tarayıcısını devre dışı bırak
    (pyodide as any).loadPackagesFromImports = async (_: string) => [];
    (pyodide as any).findImports = async (_: string) => [];

    // 4) stdout/stderr — yalnızca bir mod (batched; yoksa write)
    let outCb = (s: string) => {};
    let errCb = (s: string) => {};
    try { pyodide.setStdout({ batched: (msg: string) => outCb(msg) }); }
    catch { pyodide.setStdout({ write: (c: number) => outCb(String.fromCharCode(c)) }); }
    try { pyodide.setStderr({ batched: (msg: string) => errCb(msg) }); }
    catch { pyodide.setStderr({ write: (c: number) => errCb(String.fromCharCode(c)) }); }

    await pyodide.runPythonAsync(`
    import builtins
    try:
        from js import prompt
    except Exception:
        prompt = None

    def _input(prompt_text=""):
        if prompt is None:
            raise RuntimeError("Tarayıcı prompt() kullanılamıyor.")
        r = prompt(prompt_text)
        if r is None:
            raise KeyboardInterrupt("Input cancelled")
        return str(r)

    def input_int(prompt_text="", min=None, max=None):
        while True:
            s = _input(prompt_text).strip()
            try:
                val = int(s)
            except ValueError:
                print("Lütfen tam sayı girin."); 
                continue
            if (min is not None and val < min) or (max is not None and val > max):
                rng = ("" if min is None else f"{min}") + ("–" if min is not None or max is not None else "") + ("" if max is None else f"{max}")
                print(f"{rng} aralığında bir sayı girin.")
                continue
            return val

    def input_float(prompt_text="", min=None, max=None):
        while True:
            s = _input(prompt_text).strip().replace(",", ".")  # 3,14 da kabul
            try:
                val = float(s)
            except ValueError:
                print("Lütfen sayısal değer girin.");
                continue
            if (min is not None and val < min) or (max is not None and val > max):
                rng = ("" if min is None else f"{min}") + ("–" if min is not None or max is not None else "") + ("" if max is None else f"{max}")
                print(f"{rng} aralığında bir değer girin.")
                continue
            return val

    builtins.input = _input
    builtins.input_int = input_int
    builtins.input_float = input_float
    `)

    // 6) Kullanıcı kodunu çalıştır
    async function run(code: string) {
      await pyodide.runPythonAsync(code);
    }

    return {
      pyodide,
      onStdout(cb) { outCb = cb; },
      onStderr(cb) { errCb = cb; },
      run
    };
  })();

  return boot;
}
