import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-BQrKfpLi.js";import{s as r}from"./helpers-9OAu9hCQ.js";import{t as i}from"./sx-aware-component-CF-Nc7sM.js";import{a,i as o,n as s,r as c,t as l}from"./sx-aware-text-BFG8q7HI.js";n();var u=e(),d=t(i)`
  color: #bf4f74;
  font-weight: bold;
`,f=t(i)`
  @media print {
    display: block;
  }
`,p=t(a)`
  @media print {
    display: block;
  }
`,m=t(o)`
  @media print {
    display: block;
  }
`,h=t(i)`
  color: white;
`,g=t(i)`
  background-color: #fef3c7;
`,_=t(i)`
  color: ${e=>e.active?`green`:`gray`};
`,v=t(i)`
  color: red;
`,y=t(i).attrs({type:`button`})`
  display: inline-flex;
  background-color: ${e=>e.$open?`#dbeafe`:`#f8fafc`};
`,b=t(i)`
  color: #14532d;
  ${r(!0)};
`,x=t(c)`
  color: navy;
  line-height: 20px;
`,S=t(c)`
  min-width: var(--column-width);
  flex-shrink: 0;
`,C=t(l)`
  margin-left: 4px;
  color: #2563eb;
`,w=t(s)`
  align-items: center;
  min-width: 24px;
`,T=t(i)`
  border-color: #c084fc;
`,E=t(T)`
  background-color: #f5f3ff;
`,D=t(T)`
  color: #4c1d95;
`,O=t(T)`
  color: #6d28d9;
`,k=t(T)`
  color: #7c3aed;
`,A=t(T)`
  color: #9333ea;
`,j=t(T)`
  color: #a855f7;
`,M=t(T)`
  color: #c084fc;
`,N=t(T)`
  color: #d8b4fe;
`,P=t(T)`
  color: #e9d5ff;
`,F=t(T)`
  color: #f3e8ff;
`,I=t(T)`
  color: #581c87;
`,L={caller:{kMnn75:`xujl8zx`,$$css:!0}},R={"--column-width":`96px`,display:`flex`,gap:8,padding:8},z=()=>(0,u.jsxs)(`div`,{style:{display:`flex`,flexWrap:`wrap`,gap:8,padding:16,width:480},children:[(0,u.jsx)(d,{children:`Default`}),(0,u.jsx)(d,{className:`extra-class`,style:{marginTop:4},children:`With external className/style`}),(0,u.jsx)(d,{sx:L.caller,children:`Caller sx`}),(0,u.jsx)(f,{children:`Print display`}),(0,u.jsx)(p,{children:`Default export print`}),(0,u.jsx)(m,{children:`Directory import print`}),(0,u.jsx)(h,{children:`Primary 1`}),(0,u.jsx)(h,{children:`Primary 2`}),(0,u.jsx)(g,{sx:L.caller,children:`Inlined with caller sx`}),(0,u.jsx)(_,{active:!0,children:`Active forwarded`}),(0,u.jsx)(_,{children:`Inactive forwarded`}),(0,u.jsx)(v,{children:`Exported`}),(0,u.jsx)(v,{sx:L.caller,children:`Exported with caller sx`}),(0,u.jsx)(y,{$open:!0,sx:L.caller,children:`Exported toggle`}),(0,u.jsx)(b,{sx:L.caller,children:`Draggable sx`}),(0,u.jsx)(x,{size:`md`,children:`Generic Text`}),(0,u.jsx)(C,{color:`currentColor`,"aria-label":`Imported icon`}),(0,u.jsx)(w,{delay:100,children:`Imported tooltip`}),(0,u.jsx)(E,{sx:L.caller,children:`Interface wrapper`}),(0,u.jsx)(O,{sx:L.caller,children:`Imported type wrapper`}),(0,u.jsx)(k,{sx:L.caller,children:`Imported interface wrapper`}),(0,u.jsx)(A,{sx:L.caller,children:`Namespace type wrapper`}),(0,u.jsx)(j,{sx:L.caller,children:`Namespace interface wrapper`}),(0,u.jsx)(M,{sx:L.caller,children:`Barrel type wrapper`}),(0,u.jsx)(N,{sx:L.caller,children:`Default imported type wrapper`}),(0,u.jsx)(P,{sx:L.caller,children:`Default barrel type wrapper`}),(0,u.jsx)(F,{sx:L.caller,children:`Local default type wrapper`}),(0,u.jsx)(D,{sx:L.caller,children:`Explicit wrapper`}),(0,u.jsx)(I,{children:`Omit sx wrapper`}),(0,u.jsxs)(`div`,{style:R,children:[(0,u.jsx)(S,{color:`labelMuted`,children:`ABC-123`}),(0,u.jsx)(`span`,{children:`Item title`})]})]});export{z as App,b as DraggableSxButton,v as ExportedAccentButton,y as ExportedToggleButton};