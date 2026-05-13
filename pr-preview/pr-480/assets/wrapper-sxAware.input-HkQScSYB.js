import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-BhrcPEa4.js";import{s as r}from"./helpers-BaCk927M.js";import{t as i}from"./sx-aware-component-30DNvmHS.js";import{n as a,r as o,t as s}from"./sx-aware-text-BVFioMwi.js";n();var c=e(),l=t(i)`
  color: #bf4f74;
  font-weight: bold;
`,u=t(i)`
  color: white;
`,d=t(i)`
  background-color: #fef3c7;
`,f=t(i)`
  color: ${e=>e.active?`green`:`gray`};
`,p=t(i)`
  color: red;
`,m=t(i).attrs({type:`button`})`
  display: inline-flex;
  background-color: ${e=>e.$open?`#dbeafe`:`#f8fafc`};
`,h=t(i)`
  color: #14532d;
  ${r(!0)};
`,g=t(o)`
  color: navy;
  line-height: 20px;
`,_=t(o)`
  min-width: var(--column-width);
  flex-shrink: 0;
`,v=t(s)`
  margin-left: 4px;
  color: #2563eb;
`,y=t(a)`
  align-items: center;
  min-width: 24px;
`,b=t(i)`
  border-color: #c084fc;
`,x=t(b)`
  background-color: #f5f3ff;
`,S=t(b)`
  color: #4c1d95;
`,C=t(b)`
  color: #6d28d9;
`,w=t(b)`
  color: #7c3aed;
`,T=t(b)`
  color: #9333ea;
`,E=t(b)`
  color: #a855f7;
`,D=t(b)`
  color: #c084fc;
`,O=t(b)`
  color: #d8b4fe;
`,k=t(b)`
  color: #e9d5ff;
`,A=t(b)`
  color: #f3e8ff;
`,j=t(b)`
  color: #581c87;
`,M={caller:{kMnn75:`xujl8zx`,$$css:!0}},N={"--column-width":`96px`,display:`flex`,gap:8,padding:8},P=()=>(0,c.jsxs)(`div`,{style:{display:`flex`,flexWrap:`wrap`,gap:8,padding:16,width:480},children:[(0,c.jsx)(l,{children:`Default`}),(0,c.jsx)(l,{className:`extra-class`,style:{marginTop:4},children:`With external className/style`}),(0,c.jsx)(l,{sx:M.caller,children:`Caller sx`}),(0,c.jsx)(u,{children:`Primary 1`}),(0,c.jsx)(u,{children:`Primary 2`}),(0,c.jsx)(d,{sx:M.caller,children:`Inlined with caller sx`}),(0,c.jsx)(f,{active:!0,children:`Active forwarded`}),(0,c.jsx)(f,{children:`Inactive forwarded`}),(0,c.jsx)(p,{children:`Exported`}),(0,c.jsx)(p,{sx:M.caller,children:`Exported with caller sx`}),(0,c.jsx)(m,{$open:!0,sx:M.caller,children:`Exported toggle`}),(0,c.jsx)(h,{sx:M.caller,children:`Draggable sx`}),(0,c.jsx)(g,{size:`md`,children:`Generic Text`}),(0,c.jsx)(v,{color:`currentColor`,"aria-label":`Imported icon`}),(0,c.jsx)(y,{delay:100,children:`Imported tooltip`}),(0,c.jsx)(x,{sx:M.caller,children:`Interface wrapper`}),(0,c.jsx)(C,{sx:M.caller,children:`Imported type wrapper`}),(0,c.jsx)(w,{sx:M.caller,children:`Imported interface wrapper`}),(0,c.jsx)(T,{sx:M.caller,children:`Namespace type wrapper`}),(0,c.jsx)(E,{sx:M.caller,children:`Namespace interface wrapper`}),(0,c.jsx)(D,{sx:M.caller,children:`Barrel type wrapper`}),(0,c.jsx)(O,{sx:M.caller,children:`Default imported type wrapper`}),(0,c.jsx)(k,{sx:M.caller,children:`Default barrel type wrapper`}),(0,c.jsx)(A,{sx:M.caller,children:`Local default type wrapper`}),(0,c.jsx)(S,{sx:M.caller,children:`Explicit wrapper`}),(0,c.jsx)(j,{children:`Omit sx wrapper`}),(0,c.jsxs)(`div`,{style:N,children:[(0,c.jsx)(_,{color:`labelMuted`,children:`ABC-123`}),(0,c.jsx)(`span`,{children:`Item title`})]})]});export{P as App,h as DraggableSxButton,p as ExportedAccentButton,m as ExportedToggleButton};