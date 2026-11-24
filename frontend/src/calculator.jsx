import React, { useEffect, useRef, useState } from "react";
import { Calculator, Clipboard, History, X } from "lucide-react";

const STORAGE_KEY = "bbs-calculator-v1";
const readStored = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
};

function calculate(source) {
  const text = String(source).replace(/×/g, "*").replace(/÷/g, "/");
  if (!text.trim() || !/^[\d+\-*/%.()\s]+$/.test(text))
    throw new Error("Invalid expression");
  const tokens = text.match(/\d*\.?\d+|[()+\-*/%]/g) || [];
  let index = 0;
  const primary = () => {
    const token = tokens[index++];
    if (token === "(") {
      const value = expression();
      if (tokens[index++] !== ")") throw new Error("Missing bracket");
      return value;
    }
    if (token === "+") return primary();
    if (token === "-") return -primary();
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error("Invalid number");
    return value;
  };
  const term = () => {
    let value = primary();
    while (["*", "/", "%"].includes(tokens[index])) {
      const operator = tokens[index++];
      const right = primary();
      if ((operator === "/" || operator === "%") && right === 0)
        throw new Error("Cannot divide by zero");
      value = operator === "*" ? value * right : operator === "/" ? value / right : value % right;
    }
    return value;
  };
  function expression() {
    let value = term();
    while (["+", "-"].includes(tokens[index])) {
      const operator = tokens[index++];
      const right = term();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }
  const value = expression();
  if (index !== tokens.length || !Number.isFinite(value))
    throw new Error("Invalid expression");
  return Math.round((value + Number.EPSILON) * 1e10) / 1e10;
}

export default function CalculatorDrawer() {
  const stored = useRef(readStored()).current;
  const [open, setOpen] = useState(Boolean(stored.open));
  const [expression, setExpression] = useState(stored.expression || "");
  const [result, setResult] = useState(stored.result ?? "0");
  const [history, setHistory] = useState(Array.isArray(stored.history) ? stored.history : []);
  const [copied, setCopied] = useState(false);
  const drawer = useRef(null);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ open, expression, result, history: history.slice(0, 20) }),
    );
  }, [open, expression, result, history]);

  const solve = () => {
    try {
      const value = calculate(expression);
      setResult(String(value));
      setHistory((current) => [
        { expression, result: String(value) },
        ...current.filter((item) => item.expression !== expression),
      ].slice(0, 20));
    } catch (error) {
      setResult(error.message);
    }
  };
  const press = (key) => {
    if (key === "=") return solve();
    if (key === "C") {
      setExpression("");
      setResult("0");
      return;
    }
    if (key === "⌫") {
      setExpression((value) => value.slice(0, -1));
      return;
    }
    setExpression((value) => `${value}${key}`);
  };
  const onKeyDown = (event) => {
    if (/^[0-9.+\-*/%()]$/.test(event.key)) {
      event.preventDefault();
      press(event.key);
    } else if (event.key === "Enter" || event.key === "=") {
      event.preventDefault();
      solve();
    } else if (event.key === "Backspace") {
      event.preventDefault();
      press("⌫");
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };
  const copy = async () => {
    await navigator.clipboard.writeText(String(result));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  const keys = ["C", "(", ")", "⌫", "7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "-", "0", ".", "%", "+"];

  return (
    <div className={`calculator-shell${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="calculator-tab"
        aria-label={open ? "Close calculator" : "Open calculator"}
        title="Calculator"
        onClick={() => {
          setOpen((value) => !value);
          setTimeout(() => drawer.current?.focus(), 0);
        }}
      >
        <Calculator size={19} />
      </button>
      <aside
        className="calculator-drawer"
        aria-label="Calculator"
        ref={drawer}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header>
          <div><Calculator size={18} /><strong>Calculator</strong></div>
          <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close calculator"><X size={17} /></button>
        </header>
        <div className="calculator-display">
          <div>{expression || "0"}</div>
          <strong>{result}</strong>
          <button type="button" onClick={copy} title="Copy result"><Clipboard size={14} />{copied ? "Copied" : "Copy"}</button>
        </div>
        <div className="calculator-keys">
          {keys.map((key) => (
            <button type="button" key={key} onClick={() => press(key)} className={/[+\-×÷%=]/.test(key) ? "operator" : ""}>{key}</button>
          ))}
          <button type="button" className="equals" onClick={solve}>=</button>
        </div>
        <section className="calculator-history">
          <div><History size={14} /><strong>History</strong>{history.length > 0 && <button type="button" onClick={() => setHistory([])}>Clear</button>}</div>
          {history.length ? history.map((item, index) => (
            <button type="button" key={`${item.expression}-${index}`} onClick={() => { setExpression(item.expression); setResult(item.result); }}>
              <span>{item.expression}</span><strong>= {item.result}</strong>
            </button>
          )) : <small>No calculations yet</small>}
        </section>
      </aside>
    </div>
  );
}
