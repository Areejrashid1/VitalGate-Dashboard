// Data table with sorting and pagination. Rows and filters live in the caller; the table keeps sort/page state
// across data refreshes so a live update does not throw the analyst back to page 1.
import { esc } from "../core/fmt.js";
import { icon } from "./icons.js";

export class Table {
  /**
   * cols: [{key, label, get(row) -> sortable value, html(row) -> cell html, num, sort: false, width}]
   * opts: {pageSize, onRow(row), rowKey(row), empty, sortKey, sortDir}
   */
  constructor(el, cols, opts = {}) {
    this.el = el; this.cols = cols; this.o = opts; this.rows = [];
    this.sortKey = opts.sortKey || null; this.dir = opts.sortDir || "desc"; this.page = 0; this.size = opts.pageSize || 12;
    el.addEventListener("click", (e) => {
      const th = e.target.closest("th[data-k]");
      if (th) { const k = th.dataset.k; if (this.sortKey === k) this.dir = this.dir === "asc" ? "desc" : "asc"; else { this.sortKey = k; this.dir = "desc"; } this.render(); return; }
      const pg = e.target.closest("[data-pg]");
      if (pg) { this.page = Math.max(0, Math.min(this.pages() - 1, this.page + Number(pg.dataset.pg))); this.render(); return; }
      const tr = e.target.closest("tr[data-i]");
      if (tr && this.o.onRow && !e.target.closest("a,button,input,select")) this.o.onRow(this.view[Number(tr.dataset.i)]);
    });
    el.addEventListener("keydown", (e) => {
      const tr = e.target.closest("tr[data-i]");
      if (tr && e.key === "Enter" && this.o.onRow) this.o.onRow(this.view[Number(tr.dataset.i)]);
    });
    el.addEventListener("change", (e) => { if (e.target.matches("[data-size]")) { this.size = Number(e.target.value); this.page = 0; this.render(); } });
  }
  pages() { return Math.max(1, Math.ceil(this.rows.length / this.size)); }
  set(rows, resetPage = false) { this.rows = rows; if (resetPage) this.page = 0; this.render(); }
  sorted() {
    const c = this.cols.find((x) => x.key === this.sortKey);
    if (!c) return this.rows;
    const g = c.get || ((r) => r[c.key]), m = this.dir === "asc" ? 1 : -1;
    return [...this.rows].sort((a, b) => { const x = g(a), y = g(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * m; });
  }
  render() {
    this.page = Math.min(this.page, this.pages() - 1);
    const all = this.sorted(), start = this.page * this.size; this.view = all.slice(start, start + this.size);
    const head = this.cols.map((c) => `<th ${c.sort === false ? "" : `data-k="${c.key}"`} class="${c.sort === false ? "" : "sortable"} ${c.num ? "num" : ""}" style="${c.width ? `width:${c.width}` : ""}">${esc(c.label)}${this.sortKey === c.key ? `<span class="arr">${this.dir === "asc" ? "↑" : "↓"}</span>` : ""}</th>`).join("");
    const body = this.view.map((r, i) => `<tr data-i="${i}" ${this.o.onRow ? 'class="click" tabindex="0"' : ""}>${this.cols.map((c) => `<td class="${c.num ? "num" : ""}">${c.html ? c.html(r) : esc(c.get ? c.get(r) : r[c.key])}</td>`).join("")}</tr>`).join("");
    const empty = `<div class="empty"><div class="eic">${icon(this.o.emptyIcon || "list")}</div><b>${esc(this.o.empty || "Nothing to show")}</b>${this.o.emptySub ? `<div class="small">${esc(this.o.emptySub)}</div>` : ""}</div>`;
    this.el.innerHTML = `<div class="table-wrap"><table class="t"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${this.rows.length ? "" : empty}
      ${this.rows.length > Math.min(this.size, 10) ? `<div class="pager"><span>${start + 1}–${Math.min(all.length, start + this.size)} of ${all.length}</span>
      <div class="row"><select class="input sm" data-size aria-label="Rows per page">${[10, 12, 25, 50, 100].map((n) => `<option ${n === this.size ? "selected" : ""}>${n}</option>`).join("")}</select>
      <div class="pg"><button class="btn xs" data-pg="-1" ${this.page ? "" : "disabled"} aria-label="Previous page">${icon("chevLeft")}</button>
      <span class="small" style="padding:4px 6px">Page ${this.page + 1} / ${this.pages()}</span>
      <button class="btn xs" data-pg="1" ${this.page < this.pages() - 1 ? "" : "disabled"} aria-label="Next page">${icon("chevRight")}</button></div></div></div>` : ""}`;
  }
}
