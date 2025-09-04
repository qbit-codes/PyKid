// src/lib/pyodide.ts
// src/lib/pyodide.ts
// Basit ve sağlam: ÇIKTIYI PYTHON TARAFINDA YAKALA, SONDA TEK SEFERDE VER
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

    // 3) Paket/import taramasını kapat
    (pyodide as any).loadPackagesFromImports = async (_: string) => [];
    (pyodide as any).findImports = async (_: string) => [];

    // 4) input yardımcıları (senin kodun)
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
            print("Lütfen tam sayı girin.")
            continue
        if (min is not None and val < min) or (max is not None and val > max):
            rng = ("" if min is None else f"{min}") + ("–" if min is not None or max is not None else "") + ("" if max is None else f"{max}")
            print(f"{rng} aralığında bir sayı girin.")
            continue
        return val

def input_float(prompt_text="", min=None, max=None):
    while True:
        s = _input(prompt_text).strip().replace(",", ".")
        try:
            val = float(s)
        except ValueError:
            print("Lütfen sayısal değer girin.")
            continue
        if (min is not None and val < min) or (max is not None and val > max):
            rng = ("" if min is None else f"{min}") + ("–" if min is not None or max is not None else "") + ("" if max is None else f"{max}")
            print(f"{rng} aralığında bir değer girin.")
            continue
        return val

builtins.input = _input
builtins.input_int = input_int
builtins.input_float = input_float
    `);

    // 5) JS -> Svelte callback'leri (tek seferde kullanılacak)
    let outCb = (s: string) => {};
    let errCb = (s: string) => {};

    // 6) Kullanıcı kodunu çalıştır: StringIO ile stdout/stderr yakala, en sonda dök
    async function run(code: string) {
      const src = code.replace(/\r\n/g, '\n'); // CRLF -> LF

      // Python tarafında kodu derle/çalıştır, çıktıyı tuple olarak geri ver
      const py = `
import sys, io, traceback

__buf_out = io.StringIO()
__buf_err = io.StringIO()
__old_out, __old_err = sys.stdout, sys.stderr
sys.stdout, sys.stderr = __buf_out, __buf_err

__exc = None
try:
    __src = ${JSON.stringify(src)}
    exec(compile(__src, "<user>", "exec"), globals())
except Exception:
    __exc = traceback.format_exc()
finally:
    sys.stdout, sys.stderr = __old_out, __old_err

(__buf_out.getvalue(), __buf_err.getvalue(), __exc)
      `;

      // Pyodide, Python tuple[str,str,Optional[str]]'ı JS array'e çevirir
      const result = await pyodide.runPythonAsync(py);
      const [stdout, stderr, exc] = result as [string, string, string | null];

      if (stdout) { try { outCb(stdout); } catch {} }
      if (stderr) { try { errCb(stderr); } catch {} }
      if (exc)    { try { errCb(exc);    } catch {} }
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



// Referans amaçlı eski kod
/*
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

    // ---- Yardımcı: Çıktı normalizasyonu (CRLF/CR -> LF, literal \n -> LF)
    const normalize = (chunk: string) =>
      chunk
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\\n/g, '\n');

    // 4) stdout/stderr — önce batched varsa onu, yoksa write (string!)
    let outCb = (s: string) => {};
    let errCb = (s: string) => {};

    const emitOut = (s: string) => { if (s) outCb(normalize(s)); };
    const emitErr = (s: string) => { if (s) errCb(normalize(s)); };

    try {
      pyodide.setStdout({ batched: (msg: string) => emitOut(msg) });
    } catch {
      // ÖNEMLİ: write parametresi string olmalı
      pyodide.setStdout({ write: (s: string) => emitOut(s) });
    }

    try {
      pyodide.setStderr({ batched: (msg: string) => emitErr(msg) });
    } catch {
      pyodide.setStderr({ write: (s: string) => emitErr(s) });
    }

    // 5) Python tarafında newline'ı garanti altına al
    await pyodide.runPythonAsync(`
import sys, builtins
# Pyodide'de TextIOWrapper mevcutsa newline'ı zorla
try:
    sys.stdout.reconfigure(newline="\\n")
    sys.stderr.reconfigure(newline="\\n")
except Exception:
    pass

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
            print("Lütfen tam sayı girin.")
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
            print("Lütfen sayısal değer girin.")
            continue
        if (min is not None and val < min) or (max is not None and val > max):
            rng = ("" if min is None else f"{min}") + ("–" if min is not None or max is not None else "") + ("" if max is None else f"{max}")
            print(f"{rng} aralığında bir değer girin.")
            continue
        return val

builtins.input = _input
builtins.input_int = input_int
builtins.input_float = input_float
    `);

    // 6) Kullanıcı kodunu çalıştır (kaynakta CRLF -> LF)
    async function run(code: string) {
      const src = code.replace(/\r\n/g, '\n');
      await pyodide.runPythonAsync(src);
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
*/