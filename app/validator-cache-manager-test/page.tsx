"use client";

import { useEffect, useRef, useState } from "react";
import type { TestResult } from "./cases";

export default function ValidatorCacheManagerTestPage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [current, setCurrent] = useState("");
  const [runError, setRunError] = useState<string | null>(null);
  const [availableCases, setAvailableCases] = useState<string[]>([]);
  const [selectedCase, setSelectedCase] = useState("");
  const running = useRef(false);

  useEffect(() => {
    let active = true;
    // 仅加载用例名称，不调用校验器。选择用例、刷新页面都不会触发测试。
    import("./cases").then(({ caseNames }) => {
      if (!active) return;
      setAvailableCases(caseNames);
      setSelectedCase(caseNames[0] ?? "");
    }).catch(error => {
      if (active) setRunError(error instanceof Error ? error.message : String(error));
    });
    return () => { active = false; };
  }, []);

  async function runTests(selectedName?: string) {
    if (running.current) return;
    running.current = true;
    setIsRunning(true);
    setRunError(null);
    setHasRun(false);
    setResults([]);
    try {
      // 仅点击运行按钮才执行测试，服务端渲染不运行校验。
      const { runValidatorTests, testCount } = await import("./cases");
      setTotal(selectedName === undefined ? testCount : 1);
      setResults(await runValidatorTests(setCurrent, selectedName));
      setHasRun(true);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
    } finally {
      running.current = false;
      setIsRunning(false);
      setCurrent("");
    }
  }
  const passed = results.filter(result => result.passed).length;
  const failures = results.filter(result => !result.passed);
  const successes = results.filter(result => result.passed);
  const percentage = results.length ? Math.round(passed / results.length * 100) : 0;
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <p className="mb-2 font-mono text-xs tracking-wider text-slate-500">validatorCacheManager</p>
            <h1 className="text-3xl font-bold tracking-tight">校验模块测试报告</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">在浏览器执行测试。先打开 F12，再点击运行，源码中的 debugger 即可暂停。</p>
          </div>
          <button type="button" onClick={() => runTests()} disabled={isRunning} className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 disabled:cursor-wait disabled:opacity-60 sm:self-auto">
            <span aria-hidden="true">↻</span> {isRunning ? "测试运行中…" : "运行全部测试"}
          </button>
        </header>
        <section aria-label="指定用例" className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <label htmlFor="test-case" className="block text-sm font-semibold">只运行指定用例</label>
          <p className="mb-4 mt-1 text-sm leading-6 text-slate-500">选择要调试的 case，点击运行后仅触发这一项。</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <select id="test-case" value={selectedCase} onChange={event => setSelectedCase(event.target.value)} disabled={isRunning || !availableCases.length} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-60">
              {!availableCases.length && <option value="">正在加载用例…</option>}
              {availableCases.map((name, index) => <option key={name} value={name}>{String(index + 1).padStart(2, "0")} · {name}</option>)}
            </select>
            <button type="button" onClick={() => runTests(selectedCase)} disabled={isRunning || !selectedCase} className="shrink-0 rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 disabled:cursor-not-allowed disabled:opacity-60">运行选中用例</button>
          </div>
        </section>
        <section aria-label="测试概览" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-3 divide-x divide-slate-100 py-6 sm:py-8">
            {[
              { label: "本次用例数", value: total ?? "—", color: "text-slate-900" },
              { label: "已通过", value: hasRun ? passed : "—", color: "text-emerald-700" },
              { label: "未通过", value: hasRun ? failures.length : "—", color: "text-rose-600" },
            ].map(item => (
              <div key={item.label} className="px-4 sm:px-8">
                <p className="text-xs text-slate-500 sm:text-sm">{item.label}</p>
                <p className={`mt-2 text-3xl font-semibold tabular-nums sm:text-4xl ${item.color}`}>{item.value}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-100 px-4 py-4 sm:px-8">
            <div className="mb-2 flex justify-between text-xs text-slate-500"><span>通过率</span><span>{hasRun ? `${percentage}%` : "等待测试结果"}</span></div>
            <div role="progressbar" aria-label="测试通过率" aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percentage}%` }} />
            </div>
          </div>
        </section>
        <section aria-labelledby="failures-title" className="mt-10">
          <div className="mb-4 flex items-center gap-3">
            <h2 id="failures-title" className="text-lg font-semibold">{runError ? "运行出错" : isRunning ? "正在执行" : !hasRun ? "准备就绪" : failures.length ? "需要排查" : "全部通过"}</h2>
            {hasRun && <span className="rounded-full bg-slate-200/70 px-2.5 py-0.5 text-xs font-medium text-slate-600">{failures.length} 项</span>}
          </div>
          <p role="status" className="mb-5 text-sm leading-6 text-slate-500">
            {runError ?? (isRunning ? `当前测试：${current || "正在加载测试模块…"}。如果已在断点暂停，请在开发者工具中继续执行。` : !hasRun ? "选择一个用例单独运行，或运行全部测试。刷新页面不会自动运行。" : failures.length ? "以下行为与预期不一致。每项分别列出应该得到的结果和实际得到的结果。" : "本次运行的测试结果都符合预期。")}
          </p>
          <ol className="space-y-4">
            {failures.map((result, index) => (
              <li key={result.name} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="p-5 sm:p-6">
                  <div className="flex items-start gap-3">
                    <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-xs font-semibold text-rose-700">{String(index + 1).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold leading-7">{result.name}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-500">{result.error}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">未通过</span>
                  </div>
                  {result.comparison && (
                    <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <dt className="mb-2 text-xs font-medium text-slate-500">预期结果 · 应该得到什么</dt>
                        <dd className="whitespace-pre-wrap break-words text-sm font-medium leading-6">{result.comparison.expected}</dd>
                      </div>
                      <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4">
                        <dt className="mb-2 text-xs font-medium text-rose-700">实际结果 · 代码返回了什么</dt>
                        <dd className="whitespace-pre-wrap break-words text-sm font-medium leading-6 text-rose-900">{result.comparison.actual}</dd>
                      </div>
                    </dl>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
        {hasRun && <details className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <summary className="cursor-pointer rounded-2xl p-5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 sm:px-6">
            <span className="ml-2 text-emerald-700">已通过的测试</span><span className="ml-2 font-normal text-slate-500">{passed} 项 · 展开查看</span>
          </summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-100 px-5 sm:px-6">
            {successes.map(result => (
              <li key={result.name} className="flex gap-3 py-4 text-sm leading-6">
                <span className="text-emerald-600" aria-label="通过">✓</span><span>{result.name}</span>
              </li>
            ))}
          </ul>
        </details>}
        <p className="mt-6 text-center text-xs leading-6 text-slate-400">浏览器本地执行 · 每次运行使用全新数据 · 不修改模块源码</p>
      </div>
    </main>
  );
}
