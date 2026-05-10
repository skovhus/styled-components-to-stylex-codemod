import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-CIHNuOWG.js";import{s as r}from"./helpers-BWmHEWmL.js";import{t as i}from"./sx-aware-component-Dr5WOniw.js";import{t as a}from"./sx-aware-text-DLXUDyHh.js";n();var o=e(),s=t(i)`
  color: #bf4f74;
  font-weight: bold;
`,c=t(i)`
  color: white;
`,l=t(i)`
  background-color: #fef3c7;
`,u=t(i)`
  color: ${e=>e.active?`green`:`gray`};
`,d=t(i)`
  color: red;
`,f=t(i).attrs({type:`button`})`
  display: inline-flex;
  background-color: ${e=>e.$open?`#dbeafe`:`#f8fafc`};
`,p=t(i)`
  color: #14532d;
  ${r(!0)};
`,m=t(a)`
  color: navy;
  line-height: 20px;
`,h=t(a)`
  min-width: var(--column-width);
  flex-shrink: 0;
`,g={caller:{kMnn75:`xujl8zx`,$$css:!0}},_={"--column-width":`96px`,display:`flex`,gap:8,padding:8},v=()=>(0,o.jsxs)(`div`,{style:{display:`flex`,flexWrap:`wrap`,gap:8,padding:16,width:480},children:[(0,o.jsx)(s,{children:`Default`}),(0,o.jsx)(s,{className:`extra-class`,style:{marginTop:4},children:`With external className/style`}),(0,o.jsx)(s,{sx:g.caller,children:`Caller sx`}),(0,o.jsx)(c,{children:`Primary 1`}),(0,o.jsx)(c,{children:`Primary 2`}),(0,o.jsx)(l,{sx:g.caller,children:`Inlined with caller sx`}),(0,o.jsx)(u,{active:!0,children:`Active forwarded`}),(0,o.jsx)(u,{children:`Inactive forwarded`}),(0,o.jsx)(d,{children:`Exported`}),(0,o.jsx)(d,{sx:g.caller,children:`Exported with caller sx`}),(0,o.jsx)(f,{$open:!0,sx:g.caller,children:`Exported toggle`}),(0,o.jsx)(p,{sx:g.caller,children:`Draggable sx`}),(0,o.jsx)(m,{size:`md`,children:`Generic Text`}),(0,o.jsxs)(`div`,{style:_,children:[(0,o.jsx)(h,{color:`labelMuted`,children:`ABC-123`}),(0,o.jsx)(`span`,{children:`Item title`})]})]});export{v as App,p as DraggableSxButton,d as ExportedAccentButton,f as ExportedToggleButton};