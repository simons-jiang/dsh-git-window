/**
 * The plugin's whole stylesheet. Rendered as one <style> element inside each
 * root component, so unmounting the entry removes every rule it added. Colours
 * come from the shell's theme tokens (with dark fallbacks) so the tool window
 * belongs to the surrounding UI; only the diff and graph semantics carry their
 * own hues.
 */
const GW_CSS = `
.gw-dock{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;
  background:var(--dsw-alias-bg-layer-1,#2b2d30);border-top:1px solid var(--dsw-alias-border-l2,#43454a);
  color:var(--dsw-alias-label-primary,#dfe1e5);font-size:12px;line-height:1.5;
  font-family:inherit;user-select:none;overflow:hidden;box-sizing:border-box}
.gw-dock *{box-sizing:border-box}
.gw-resizer{position:absolute;top:-3px;left:0;right:0;height:7px;cursor:ns-resize;z-index:5}
.gw-resizer:hover::after{content:"";position:absolute;top:3px;left:0;right:0;height:1px;background:var(--dsw-alias-brand-primary,#4a88ff);opacity:.7}

/* tool-window tab row */
.gw-tabrow{display:flex;align-items:stretch;gap:2px;height:30px;flex:0 0 auto;
  border-bottom:1px solid var(--dsw-alias-border-l1,#393b40);background:var(--dsw-alias-bg-base,#1e1f22);
  padding:0 6px}
.gw-tab{display:flex;align-items:center;gap:6px;padding:0 10px;cursor:default;
  color:var(--dsw-alias-label-secondary,#9a9ea8);border-bottom:2px solid transparent;white-space:nowrap}
.gw-tab:hover{color:var(--dsw-alias-label-primary,#dfe1e5)}
.gw-tab.active{color:var(--dsw-alias-label-primary,#dfe1e5);border-bottom-color:var(--dsw-alias-brand-primary,#4a88ff)}
.gw-tab .gw-count{font-size:10px;padding:0 5px;border-radius:8px;background:rgba(128,140,160,.22);
  color:var(--dsw-alias-label-secondary,#9a9ea8)}
.gw-tabspacer{flex:1 1 auto}
.gw-toolbar{display:flex;align-items:center;gap:6px;padding:0 2px}
.gw-chip{display:flex;align-items:center;gap:5px;height:20px;padding:0 7px;border-radius:10px;
  border:1px solid var(--dsw-alias-border-l1,#393b40);background:rgba(128,140,160,.10);cursor:default;
  color:var(--dsw-alias-label-secondary,#9a9ea8);font-size:11px;white-space:nowrap}
.gw-chip:hover{background:rgba(128,140,160,.18);color:var(--dsw-alias-label-primary,#dfe1e5)}
.gw-chip select{background:transparent;border:0;color:inherit;font:inherit;outline:none;max-width:260px;
  cursor:pointer;-webkit-appearance:none;appearance:none;padding-right:2px}
.gw-chip select option{background:var(--dsw-alias-bg-overlay,#2b2d30);color:var(--dsw-alias-label-primary,#dfe1e5)}
.gw-iconbtn{display:inline-flex;align-items:center;justify-content:center;width:22px;height:20px;
  border:0;background:transparent;color:var(--dsw-alias-label-secondary,#9a9ea8);border-radius:4px;cursor:pointer;padding:0}
.gw-iconbtn:hover{background:rgba(128,140,160,.20);color:var(--dsw-alias-label-primary,#dfe1e5)}
.gw-iconbtn.on{background:rgba(74,136,255,.22);color:var(--dsw-alias-label-primary,#dfe1e5)}
.gw-iconbtn[disabled]{opacity:.4;cursor:default}

/* body columns */
.gw-body{display:flex;flex:1 1 auto;min-height:0}
.gw-branches{flex:0 0 auto;display:flex;flex-direction:column;min-height:0;overflow:hidden;
  border-right:1px solid var(--dsw-alias-border-l1,#393b40);background:var(--dsw-alias-bg-layer-1,#2b2d30)}
.gw-branches-head{display:flex;align-items:center;gap:6px;height:26px;padding:0 8px;flex:0 0 auto;
  color:var(--dsw-alias-label-secondary,#9a9ea8);font-size:11px;letter-spacing:.02em;
  border-bottom:1px solid var(--dsw-alias-border-l1,#393b40)}
.gw-branches-scroll{flex:1 1 auto;overflow:auto;padding:4px 0 8px}
.gw-tree-group{display:flex;align-items:center;gap:5px;height:22px;padding:0 8px;cursor:pointer;
  color:var(--dsw-alias-label-secondary,#9a9ea8)}
.gw-tree-group:hover{color:var(--dsw-alias-label-primary,#dfe1e5)}
.gw-tree-row{display:flex;align-items:center;gap:5px;height:22px;padding:0 8px 0 22px;cursor:default;
  color:var(--dsw-alias-label-primary,#dfe1e5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gw-tree-row:hover{background:rgba(128,140,160,.12)}
.gw-tree-row.active{background:rgba(76,129,217,.28)}
.gw-tree-row .gw-branch-name{overflow:hidden;text-overflow:ellipsis}
.gw-tree-row .gw-branch-meta{color:var(--dsw-alias-label-secondary,#9a9ea8);font-size:10px}
.gw-tree-row.head .gw-branch-name{font-weight:600}
.gw-dock-splitter{flex:0 0 4px;cursor:col-resize;background:transparent;position:relative}
.gw-dock-splitter:hover::after{content:"";position:absolute;inset:0 1px;background:var(--dsw-alias-brand-primary,#4a88ff);opacity:.6}

/* log table */
.gw-log{flex:1 1 auto;display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--dsw-alias-bg-base,#1e1f22)}
.gw-log-head{display:grid;grid-template-columns:var(--gw-log-cols);height:26px;flex:0 0 auto;align-items:center;
  border-bottom:1px solid var(--dsw-alias-border-l1,#393b40);background:var(--dsw-alias-bg-layer-1,#2b2d30);
  color:var(--dsw-alias-label-secondary,#9a9ea8);font-size:11px;padding:0 4px}
.gw-log-head>span{padding:0 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  border-right:1px solid rgba(128,140,160,.14);height:100%;display:flex;align-items:center}
.gw-log-head>span:last-child{border-right:0}
.gw-log-scroll{flex:1 1 auto;overflow:auto;position:relative}
.gw-row{display:grid;grid-template-columns:var(--gw-log-cols);height:24px;align-items:center;padding:0 4px;
  cursor:default;white-space:nowrap;border-bottom:1px solid transparent}
.gw-row:hover{background:rgba(128,140,160,.10)}
.gw-row.selected{background:rgba(76,129,217,.30)}
.gw-row.local .gw-subject-text{font-style:italic}
.gw-cell{padding:0 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gw-graphcell{display:flex;align-items:center;justify-content:flex-start;padding:0 0 0 2px;overflow:visible}
.gw-subject{display:flex;align-items:center;gap:6px;min-width:0}
.gw-subject-text{overflow:hidden;text-overflow:ellipsis}
.gw-ref{display:inline-flex;align-items:center;height:15px;padding:0 5px;border-radius:3px;font-size:10px;
  max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 0 auto}
.gw-ref.head{background:rgba(74,136,255,.22);color:#8fb6ff;border:1px solid rgba(74,136,255,.35)}
.gw-ref.branch{background:rgba(95,184,95,.16);color:#86c98a;border:1px solid rgba(95,184,95,.28)}
.gw-ref.remote{background:rgba(128,140,160,.14);color:var(--dsw-alias-label-secondary,#9a9ea8);
  border:1px solid rgba(128,140,160,.22)}
.gw-ref.tag{background:rgba(214,160,74,.16);color:#d8ab63;border:1px solid rgba(214,160,74,.28)}
.gw-author{color:var(--dsw-alias-label-secondary,#9a9ea8);font-size:11px}
.gw-date{color:var(--dsw-alias-label-secondary,#9a9ea8);font-size:11px}

/* commit details */
.gw-detail{flex:0 0 auto;display:flex;flex-direction:column;min-height:0;overflow:hidden;
  border-left:1px solid var(--dsw-alias-border-l1,#393b40);background:var(--dsw-alias-bg-layer-1,#2b2d30)}
.gw-detail-head{flex:0 0 auto;padding:8px 10px 6px;border-bottom:1px solid var(--dsw-alias-border-l1,#393b40)}
.gw-detail-subject{font-size:12px;font-weight:600;line-height:1.35;color:var(--dsw-alias-label-primary,#dfe1e5);
  word-break:break-word;white-space:normal}
.gw-detail-meta{display:flex;align-items:center;gap:6px;margin-top:4px;color:var(--dsw-alias-label-secondary,#9a9ea8);font-size:11px}
.gw-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:11px}
.gw-hash{color:var(--dsw-alias-label-secondary,#9a9ea8)}
.gw-detail-message{flex:0 0 auto;max-height:34%;overflow:auto;padding:8px 10px;white-space:pre-wrap;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:11px;line-height:1.5;
  color:var(--dsw-alias-label-primary,#dfe1e5);word-break:break-word;opacity:.92}
.gw-files-head{flex:0 0 auto;display:flex;align-items:center;gap:8px;height:26px;padding:0 10px;
  border-top:1px solid var(--dsw-alias-border-l1,#393b40);border-bottom:1px solid var(--dsw-alias-border-l1,#393b40);
  color:var(--dsw-alias-label-secondary,#9a9ea8);font-size:11px}
.gw-files{flex:1 1 auto;overflow:auto;min-height:0}
.gw-file{display:flex;align-items:center;gap:6px;height:22px;padding:0 10px 0 6px;cursor:pointer;white-space:nowrap}
.gw-file:hover{background:rgba(128,140,160,.12)}
.gw-file.selected{background:rgba(76,129,217,.30)}
.gw-file .gw-status{flex:0 0 14px;text-align:center;font-size:10px;font-weight:700;font-family:ui-monospace,monospace}
.gw-file .gw-path{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;font-size:11px}
.gw-file .gw-path .gw-dir{color:var(--dsw-alias-label-secondary,#9a9ea8)}
.gw-file .gw-path .gw-name{color:var(--dsw-alias-label-primary,#dfe1e5)}
.gw-file .gw-addstat{color:#5fb85f;font-size:10px}
.gw-file .gw-delstat{color:#e0725e;font-size:10px}
.gw-empty{padding:14px 12px;color:var(--dsw-alias-label-secondary,#9a9ea8);font-size:11px;line-height:1.6;white-space:normal}
.gw-banner{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:6px 10px;font-size:11px;
  color:#e0a45a;background:rgba(224,164,90,.12);border-bottom:1px solid rgba(224,164,90,.3)}

/* centre diff panel */
.gw-diff{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base,#1e1f22);
  color:var(--dsw-alias-label-primary,#dfe1e5);font-size:12px;font-family:inherit;overflow:hidden}
.gw-etabs{flex:0 0 auto;display:flex;align-items:stretch;height:32px;gap:1px;padding:0 6px;
  background:var(--dsw-alias-bg-layer-1,#2b2d30);border-bottom:1px solid var(--dsw-alias-border-l1,#393b40);overflow-x:auto}
.gw-etab{display:flex;align-items:center;gap:6px;padding:0 10px;max-width:240px;cursor:default;
  color:var(--dsw-alias-label-secondary,#9a9ea8);border-bottom:2px solid transparent;white-space:nowrap}
.gw-etab:hover{color:var(--dsw-alias-label-primary,#dfe1e5)}
.gw-etab.active{color:var(--dsw-alias-label-primary,#dfe1e5);background:var(--dsw-alias-bg-base,#1e1f22);
  border-bottom-color:var(--dsw-alias-brand-primary,#4a88ff)}
.gw-etab .gw-tabtitle{overflow:hidden;text-overflow:ellipsis}
.gw-etab .gw-close{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;
  border-radius:3px;color:inherit;opacity:.65;font-size:11px}
.gw-etab .gw-close:hover{background:rgba(128,140,160,.3);opacity:1}
.gw-difftoolbar{flex:0 0 auto;display:flex;align-items:center;gap:10px;height:30px;padding:0 10px;min-width:0;
  border-bottom:1px solid var(--dsw-alias-border-l1,#393b40);background:var(--dsw-alias-bg-layer-1,#2b2d30);
  color:var(--dsw-alias-label-secondary,#9a9ea8);font-size:11px}
.gw-crumbs{display:flex;align-items:center;gap:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  flex:1 1 0;min-width:0}
.gw-crumbs .gw-crumb-sep{opacity:.5}
.gw-crumbs .gw-crumb-file{color:var(--dsw-alias-label-primary,#dfe1e5);flex:0 0 auto}
.gw-crumbs .gw-crumb-dirs{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;flex:0 1 auto}
.gw-seg{display:flex;flex:0 0 auto;white-space:nowrap;border:1px solid var(--dsw-alias-border-l1,#393b40);
  border-radius:4px;overflow:hidden}
.gw-seg button{height:20px;padding:0 9px;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#9a9ea8);
  font:inherit;font-size:11px;cursor:pointer;white-space:nowrap;flex:0 0 auto}
.gw-seg button.active{background:rgba(74,136,255,.24);color:var(--dsw-alias-label-primary,#dfe1e5)}
.gw-diffbody{flex:1 1 auto;overflow:auto;min-height:0;position:relative}
.gw-diffgrid{display:grid;align-items:stretch;min-width:100%;width:max-content;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:12px;line-height:20px}
.gw-diffgrid.side{grid-template-columns:minmax(max-content,50%) minmax(max-content,50%)}
.gw-diffgrid.unified{grid-template-columns:minmax(0,1fr)}
.gw-dline{display:flex;align-items:flex-start;min-height:20px;white-space:pre;tab-size:4}
.gw-dline.add{background:rgba(46,160,67,.17)}
.gw-dline.del{background:rgba(248,81,73,.15)}
.gw-dline .gw-ln{flex:0 0 auto;width:44px;padding:0 6px 0 0;text-align:right;
  color:var(--dsw-alias-label-secondary,#9a9ea8);opacity:.62;font-size:11px;
  background:rgba(128,140,160,.05);border-right:1px solid rgba(128,140,160,.10)}
.gw-dline.add .gw-ln{background:rgba(46,160,67,.22);opacity:.95}
.gw-dline.del .gw-ln{background:rgba(248,81,73,.20);opacity:.95}
.gw-dline .gw-sign{flex:0 0 14px;text-align:center;opacity:.65;user-select:none}
.gw-dline .gw-code{padding:0 10px 0 2px;min-width:0}
.gw-dline.placeholder{background:rgba(128,140,160,.045)}
.gw-hunk{display:flex;align-items:center;gap:8px;height:20px;padding:0 10px;
  background:rgba(74,136,255,.10);color:#8fb6ff;font-size:11px;border-top:1px solid rgba(74,136,255,.18);
  border-bottom:1px solid rgba(74,136,255,.18);font-family:ui-monospace,monospace}
.gw-hunk .gw-hunk-section{color:var(--dsw-alias-label-secondary,#9a9ea8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gw-diffstates{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;
  color:var(--dsw-alias-label-secondary,#9a9ea8);font-size:12px}
.gw-diffstates .gw-big{font-size:13px;color:var(--dsw-alias-label-primary,#dfe1e5)}
.gw-copytoast{position:absolute;right:12px;bottom:12px;padding:4px 8px;border-radius:4px;font-size:11px;
  background:var(--dsw-alias-bg-overlay,#2b2d30);border:1px solid var(--dsw-alias-border-l2,#43454a);
  color:var(--dsw-alias-label-primary,#dfe1e5)}
.gw-legend{display:flex;align-items:center;gap:6px;font-size:10px;opacity:.75}
.gw-kw{color:#c792ea}
.gw-str{color:#a5d6a7}
.gw-num{color:#f0b37e}
.gw-com{color:#7d8799;font-style:italic}
.gw-ann{color:#d7ba7d}
.gw-type{color:#82aaff}
.gw-punc{color:#9aa4b2}.gw-btn{height:22px;padding:0 10px;border-radius:4px;border:1px solid var(--dsw-alias-border-l1,#393b40);
  background:rgba(128,140,160,.12);color:var(--dsw-alias-label-primary,#dfe1e5);font:inherit;font-size:11px;cursor:pointer}
.gw-btn:hover{background:rgba(128,140,160,.22)}
.gw-filter{height:20px;width:150px;padding:0 8px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1,#393b40);
  background:rgba(128,140,160,.08);color:var(--dsw-alias-label-primary,#dfe1e5);font:inherit;font-size:11px;outline:none}
.gw-filter:focus{border-color:var(--dsw-alias-brand-primary,#4a88ff);background:rgba(128,140,160,.14)}
.gw-filter::placeholder{color:var(--dsw-alias-label-secondary,#9a9ea8)}
.gw-graph{display:block;overflow:visible}
.gw-more{display:block;width:100%;height:26px;border:0;border-top:1px solid var(--dsw-alias-border-l1,#393b40);
  background:transparent;color:var(--dsw-alias-label-secondary,#9a9ea8);font:inherit;font-size:11px;cursor:pointer}
.gw-more:hover{background:rgba(128,140,160,.12);color:var(--dsw-alias-label-primary,#dfe1e5)}
/* ---------- floating surfaces: menu, dialogs, notices, merge window ---------- */
.gw-menu-backdrop{position:fixed;inset:0;z-index:2147483000;background:transparent}
.gw-menu{position:fixed;z-index:2147483001;padding:4px;border-radius:8px;
  background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l2,#0000001a);
  box-shadow:0 0 0 .5px rgba(15,17,21,.10),0 2px 6px rgba(15,17,21,.08),0 12px 30px rgba(15,17,21,.20);
  color:var(--dsw-alias-label-primary,#0f1115);font-size:12px}
.gw-menu-head{display:flex;align-items:center;gap:6px;padding:5px 8px 6px;color:var(--dsw-alias-label-secondary,#61666b);
  font-size:11px;border-bottom:1px solid var(--dsw-alias-border-l1,#0000000a);margin:-4px -4px 3px;padding-left:12px;
  padding-right:12px;background:rgba(128,140,160,.07);border-radius:8px 8px 0 0}
.gw-menu-branch{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:170px}
.gw-menu-item{display:block;width:100%;text-align:left;height:26px;padding:0 8px;border:0;border-radius:4px;
  background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.gw-menu-item:hover:not([disabled]){background:rgba(128,140,160,.16)}
.gw-menu-item[disabled]{opacity:.45;cursor:default}
.gw-menu-label{display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:248px;vertical-align:middle}
.gw-menu-sep{height:1px;margin:4px 6px;background:var(--dsw-alias-border-l1,#0000000a)}

.gw-dialog{position:fixed;z-index:2147483001;top:50%;left:50%;transform:translate(-50%,-50%);
  width:min(560px,90vw);max-height:78vh;display:flex;flex-direction:column;gap:8px;padding:14px;
  border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l2,#0000001a);
  box-shadow:0 0 0 .5px rgba(15,17,21,.10),0 18px 48px rgba(15,17,21,.24);
  color:var(--dsw-alias-label-primary,#0f1115);font-size:12px}
.gw-dialog-title{font-size:13px;font-weight:600}
.gw-dialog-sub{color:var(--dsw-alias-label-secondary,#9a9ea8);font-size:11px}
.gw-dialog-text{line-height:1.6}
.gw-dialog-text.dim{color:var(--dsw-alias-label-secondary,#9a9ea8);font-size:11px}
.gw-dialog-input{width:100%;resize:vertical;min-height:64px;padding:8px;border-radius:6px;
  border:1px solid var(--dsw-alias-border-l1,#393b40);background:var(--dsw-alias-bg-base,#1e1f22);
  color:var(--dsw-alias-label-primary,#dfe1e5);font:inherit;font-size:12px;outline:none;box-sizing:border-box}
.gw-dialog-input:focus{border-color:var(--dsw-alias-brand-primary,#4a88ff)}
.gw-dialog-row{display:flex;align-items:center;gap:8px}
.gw-dialog-check{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary,#9a9ea8);font-size:11px}
.gw-dialog-files{flex:1 1 auto;min-height:80px;max-height:34vh;overflow:auto;border-radius:6px;
  border:1px solid var(--dsw-alias-border-l1,#393b40);background:var(--dsw-alias-bg-base,#1e1f22)}
.gw-dialog-file{display:flex;align-items:center;gap:6px;height:24px;padding:0 8px;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.gw-dialog-file:hover{background:rgba(128,140,160,.12)}
.gw-dialog-foot{display:flex;align-items:center;gap:8px}
.gw-btn[disabled]{opacity:.45;cursor:default}
.gw-btn.primary{background:rgba(74,136,255,.9);border-color:rgba(74,136,255,.9);color:#fff}
.gw-btn.primary:hover:not([disabled]){background:rgba(96,152,255,.95)}

.gw-notice{position:fixed;right:16px;bottom:16px;z-index:2147483002;display:flex;align-items:flex-start;gap:8px;
  max-width:min(560px,74vw);padding:9px 10px;border-radius:8px;font-size:12px;
  background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l2,#0000001a);
  box-shadow:0 0 0 .5px rgba(15,17,21,.10),0 8px 24px rgba(15,17,21,.18);
  color:var(--dsw-alias-label-primary,#0f1115)}
.gw-notice.ok{border-left:3px solid #4d9a5f}
.gw-notice.error{border-left:3px solid #d0605a}
.gw-notice.info{border-left:3px solid #4a88ff}
.gw-notice-text{white-space:normal;line-height:1.5;padding-top:2px}
.gw-notice-detail{margin:4px 0 0;max-height:120px;overflow:auto;white-space:pre-wrap;
  font-family:ui-monospace,Menlo,monospace;font-size:10px;color:var(--dsw-alias-label-secondary,#9a9ea8)}
.gw-busy{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483002;display:flex;align-items:center;gap:8px;
  padding:5px 12px;border-radius:14px;font-size:11px;background:var(--dsw-alias-bg-layer-1,#fff);
  border:1px solid var(--dsw-alias-border-l2,#0000001a);box-shadow:0 8px 24px rgba(15,17,21,.12);
  color:var(--dsw-alias-label-primary,#0f1115)}
.gw-busy-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-brand-primary,#4a88ff);
  animation:gw-pulse 1s ease-in-out infinite}
@keyframes gw-pulse{0%,100%{opacity:.35}50%{opacity:1}}
.gw-chip-warn{color:#e0a45a;border-color:rgba(224,164,90,.4);background:rgba(224,164,90,.12)}

/* merge window */
.gw-modal{position:fixed;inset:0;z-index:2147483001;display:flex;align-items:center;justify-content:center;
  background:rgba(0,0,0,.45)}
.gw-mergewin{display:flex;flex-direction:column;width:min(1560px,96vw);height:min(900px,90vh);
  border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-base,#1e1f22);
  border:1px solid var(--dsw-alias-border-l2,#43454a);box-shadow:0 24px 64px rgba(0,0,0,.55);
  color:var(--dsw-alias-label-primary,#dfe1e5);font-size:12px}
.gw-mhead{display:flex;align-items:center;gap:10px;height:34px;padding:0 8px;flex:0 0 auto;
  background:var(--dsw-alias-bg-layer-1,#2b2d30);border-bottom:1px solid var(--dsw-alias-border-l1,#393b40)}
.gw-mtitle{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
.gw-mtools{display:flex;align-items:center;gap:6px;flex:0 0 auto}
.gw-mstate{display:flex;align-items:center;gap:5px;font-size:11px;color:#d0605a;flex:0 0 auto;padding:0 4px}
.gw-mstate.ok{color:#5fb85f}
.gw-mfiles{display:flex;align-items:stretch;gap:2px;height:28px;flex:0 0 auto;padding:0 6px;
  background:var(--dsw-alias-bg-layer-1,#2b2d30);border-bottom:1px solid var(--dsw-alias-border-l1,#393b40);overflow-x:auto}
.gw-mfile{display:flex;align-items:center;gap:6px;padding:0 9px;border:0;background:transparent;cursor:pointer;
  color:var(--dsw-alias-label-secondary,#9a9ea8);font:inherit;font-size:11px;border-bottom:2px solid transparent;white-space:nowrap}
.gw-mfile.active{color:var(--dsw-alias-label-primary,#dfe1e5);border-bottom-color:var(--dsw-alias-brand-primary,#4a88ff);
  background:var(--dsw-alias-bg-base,#1e1f22)}
.gw-mcols{display:flex;align-items:center;height:26px;flex:0 0 auto;font-size:11px;
  color:var(--dsw-alias-label-secondary,#9a9ea8);border-bottom:1px solid var(--dsw-alias-border-l1,#393b40);
  background:var(--dsw-alias-bg-layer-1,#2b2d30)}
.gw-mcols>span{flex:1 1 0;padding:0 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gw-mcols>span.gw-mgutter{flex:0 0 28px;padding:0}
.gw-mbody{flex:1 1 auto;min-height:0;overflow:auto}
.gw-mtable{display:table;width:100%;border-collapse:collapse;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:12px;line-height:20px}
.gw-mband{display:table-row-group}
.gw-mrow{display:table-row}
.gw-mcell{display:table-cell;width:33%;white-space:pre;vertical-align:top;padding:0 8px 0 0}
.gw-mgutter{display:table-cell;width:28px;vertical-align:top;text-align:center;padding:0}
.gw-mno{display:inline-block;width:40px;padding-right:6px;text-align:right;
  color:var(--dsw-alias-label-secondary,#9a9ea8);opacity:.55;font-size:11px;user-select:none}
.gw-mcode{white-space:pre}
.gw-mrow.conflict>.gw-mcell{background:rgba(224,164,90,.10)}
.gw-mrow.conflict.unresolved>.gw-mcell,.gw-mrow.conflict.unresolved>.gw-mgutter{background:rgba(208,96,90,.16)}
.gw-mrow.conflict.resolved>.gw-mcell,.gw-mrow.conflict.resolved>.gw-mgutter{background:rgba(95,184,95,.13)}
.gw-mrow.conflict.resolved>.gw-mresult{background:rgba(95,184,95,.20)}
.gw-mrow.conflict.unresolved>.gw-mresult{background:rgba(208,96,90,.22)}
.gw-marrow{width:22px;height:18px;margin:1px auto 0;border:1px solid var(--dsw-alias-border-l2,#43454a);
  border-radius:3px;background:rgba(128,140,160,.16);color:var(--dsw-alias-label-primary,#dfe1e5);
  font-size:10px;line-height:1;cursor:pointer;padding:0;display:block}
.gw-marrow:hover:not([disabled]){background:rgba(74,136,255,.45)}
.gw-marrow[disabled]{opacity:.4;cursor:default}
.gw-mfoot{display:flex;align-items:center;gap:8px;height:44px;padding:0 12px;flex:0 0 auto;
  background:var(--dsw-alias-bg-layer-1,#2b2d30);border-top:1px solid var(--dsw-alias-border-l1,#393b40)}
`

/** The stylesheet element every root component renders. */
function GwStyle() {
  return h('style', { dangerouslySetInnerHTML: { __html: GW_CSS } })
}
