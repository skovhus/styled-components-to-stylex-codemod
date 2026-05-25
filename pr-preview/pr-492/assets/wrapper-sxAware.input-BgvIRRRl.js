import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-CHb75B_-.js";import{s as r}from"./helpers-By5-7k5Q.js";import{t as i}from"./sx-aware-component-CpeL1FCe.js";import{n as a,r as o,t as s}from"./sx-aware-text-CrIUiIjb.js";n();var c=e(),l=t(i)`
  color: #bf4f74;
  font-weight: bold;
`,u=t(i)`
  @media print {
    display: block;
  }
`,d=t(i)`
  color: white;
`,f=t(i)`
  background-color: #fef3c7;
`,p=t(i)`
  color: ${e=>e.active?`green`:`gray`};
`,m=t(i)`
  color: red;
`,h=t(i).attrs({type:`button`})`
  display: inline-flex;
  background-color: ${e=>e.$open?`#dbeafe`:`#f8fafc`};
`,g=t(i)`
  color: #14532d;
  ${r(!0)};
`,_=t(o)`
  color: navy;
  line-height: 20px;
`,v=t(o)`
  min-width: var(--column-width);
  flex-shrink: 0;
`,y=t(s)`
  margin-left: 4px;
  color: #2563eb;
`,b=t(a)`
  align-items: center;
  min-width: 24px;
`,x=t(i)`
  border-color: #c084fc;
`,S=t(x)`
  background-color: #f5f3ff;
`,C=t(x)`
  color: #4c1d95;
`,w=t(x)`
  color: #6d28d9;
`,T=t(x)`
  color: #7c3aed;
`,E=t(x)`
  color: #9333ea;
`,D=t(x)`
  color: #a855f7;
`,O=t(x)`
  color: #c084fc;
`,k=t(x)`
  color: #d8b4fe;
`,A=t(x)`
  color: #e9d5ff;
`,j=t(x)`
  color: #f3e8ff;
`,M=t(x)`
  color: #581c87;
`,N={caller:{kMnn75:`xujl8zx`,$$css:!0}},P={"--column-width":`96px`,display:`flex`,gap:8,padding:8},F=()=>(0,c.jsxs)(`div`,{style:{display:`flex`,flexWrap:`wrap`,gap:8,padding:16,width:480},children:[(0,c.jsx)(l,{children:`Default`}),(0,c.jsx)(l,{className:`extra-class`,style:{marginTop:4},children:`With external className/style`}),(0,c.jsx)(l,{sx:N.caller,children:`Caller sx`}),(0,c.jsx)(u,{children:`Print display`}),(0,c.jsx)(d,{children:`Primary 1`}),(0,c.jsx)(d,{children:`Primary 2`}),(0,c.jsx)(f,{sx:N.caller,children:`Inlined with caller sx`}),(0,c.jsx)(p,{active:!0,children:`Active forwarded`}),(0,c.jsx)(p,{children:`Inactive forwarded`}),(0,c.jsx)(m,{children:`Exported`}),(0,c.jsx)(m,{sx:N.caller,children:`Exported with caller sx`}),(0,c.jsx)(h,{$open:!0,sx:N.caller,children:`Exported toggle`}),(0,c.jsx)(g,{sx:N.caller,children:`Draggable sx`}),(0,c.jsx)(_,{size:`md`,children:`Generic Text`}),(0,c.jsx)(y,{color:`currentColor`,"aria-label":`Imported icon`}),(0,c.jsx)(b,{delay:100,children:`Imported tooltip`}),(0,c.jsx)(S,{sx:N.caller,children:`Interface wrapper`}),(0,c.jsx)(w,{sx:N.caller,children:`Imported type wrapper`}),(0,c.jsx)(T,{sx:N.caller,children:`Imported interface wrapper`}),(0,c.jsx)(E,{sx:N.caller,children:`Namespace type wrapper`}),(0,c.jsx)(D,{sx:N.caller,children:`Namespace interface wrapper`}),(0,c.jsx)(O,{sx:N.caller,children:`Barrel type wrapper`}),(0,c.jsx)(k,{sx:N.caller,children:`Default imported type wrapper`}),(0,c.jsx)(A,{sx:N.caller,children:`Default barrel type wrapper`}),(0,c.jsx)(j,{sx:N.caller,children:`Local default type wrapper`}),(0,c.jsx)(C,{sx:N.caller,children:`Explicit wrapper`}),(0,c.jsx)(M,{children:`Omit sx wrapper`}),(0,c.jsxs)(`div`,{style:P,children:[(0,c.jsx)(v,{color:`labelMuted`,children:`ABC-123`}),(0,c.jsx)(`span`,{children:`Item title`})]})]});export{F as App,g as DraggableSxButton,m as ExportedAccentButton,h as ExportedToggleButton};