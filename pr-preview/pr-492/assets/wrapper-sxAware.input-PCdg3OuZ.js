import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-BVze-M9q.js";import{s as r}from"./helpers-Dt0YSZVN.js";import{t as i}from"./sx-aware-component-C7b3t2e6.js";import{a,i as o,n as s,o as c,r as l,t as u}from"./sx-aware-text-e73NPx8s.js";n();var d=e(),f=t(i)`
  color: #bf4f74;
  font-weight: bold;
`,p=t(i)`
  @media print {
    display: block;
  }
`,m=t(c)`
  @media print {
    display: block;
  }
`,h=t(a)`
  @media print {
    display: block;
  }
`,g=t(o)`
  @media print {
    display: block;
  }
`,_=t(i)`
  @media print {
    display: ${e=>e.printDisplay};
  }
`,v=t(i)`
  &:hover {
    @media (hover: hover) {
      background-color: orange;
    }
  }
`,y=t(i)`
  color: white;
`,b=t(i)`
  background-color: #fef3c7;
`,x=t(i)`
  color: ${e=>e.active?`green`:`gray`};
`,S=t(i)`
  color: red;
`,C=t(i).attrs({type:`button`})`
  display: inline-flex;
  background-color: ${e=>e.$open?`#dbeafe`:`#f8fafc`};
`,w=t(i)`
  color: #14532d;
  ${r(!0)};
`,T=t(l)`
  color: navy;
  line-height: 20px;
`,E=t(l)`
  min-width: var(--column-width);
  flex-shrink: 0;
`,D=t(u)`
  margin-left: 4px;
  color: #2563eb;
`,O=t(s)`
  align-items: center;
  min-width: 24px;
`,k=t(i)`
  border-color: #c084fc;
`,A=t(k)`
  background-color: #f5f3ff;
`,j=t(k)`
  color: #4c1d95;
`,M=t(k)`
  color: #6d28d9;
`,N=t(k)`
  color: #7c3aed;
`,P=t(k)`
  color: #9333ea;
`,F=t(k)`
  color: #a855f7;
`,I=t(k)`
  color: #c084fc;
`,L=t(k)`
  color: #d8b4fe;
`,R=t(k)`
  color: #e9d5ff;
`,z=t(k)`
  color: #f3e8ff;
`,B=t(k)`
  color: #581c87;
`,V={caller:{kMnn75:`xujl8zx`,$$css:!0}},H={"--column-width":`96px`,display:`flex`,gap:8,padding:8},U=()=>(0,d.jsxs)(`div`,{style:{display:`flex`,flexWrap:`wrap`,gap:8,padding:16,width:480},children:[(0,d.jsx)(f,{children:`Default`}),(0,d.jsx)(f,{className:`extra-class`,style:{marginTop:4},children:`With external className/style`}),(0,d.jsx)(f,{sx:V.caller,children:`Caller sx`}),(0,d.jsx)(p,{children:`Print display`}),(0,d.jsx)(m,{children:`Default export print`}),(0,d.jsx)(h,{children:`Default identifier print`}),(0,d.jsx)(g,{children:`Directory import print`}),(0,d.jsx)(_,{printDisplay:`block`,children:`Dynamic print display`}),(0,d.jsx)(v,{children:`Hover media`}),(0,d.jsx)(y,{children:`Primary 1`}),(0,d.jsx)(y,{children:`Primary 2`}),(0,d.jsx)(b,{sx:V.caller,children:`Inlined with caller sx`}),(0,d.jsx)(x,{active:!0,children:`Active forwarded`}),(0,d.jsx)(x,{children:`Inactive forwarded`}),(0,d.jsx)(S,{children:`Exported`}),(0,d.jsx)(S,{sx:V.caller,children:`Exported with caller sx`}),(0,d.jsx)(C,{$open:!0,sx:V.caller,children:`Exported toggle`}),(0,d.jsx)(w,{sx:V.caller,children:`Draggable sx`}),(0,d.jsx)(T,{size:`md`,children:`Generic Text`}),(0,d.jsx)(D,{color:`currentColor`,"aria-label":`Imported icon`}),(0,d.jsx)(O,{delay:100,children:`Imported tooltip`}),(0,d.jsx)(A,{sx:V.caller,children:`Interface wrapper`}),(0,d.jsx)(M,{sx:V.caller,children:`Imported type wrapper`}),(0,d.jsx)(N,{sx:V.caller,children:`Imported interface wrapper`}),(0,d.jsx)(P,{sx:V.caller,children:`Namespace type wrapper`}),(0,d.jsx)(F,{sx:V.caller,children:`Namespace interface wrapper`}),(0,d.jsx)(I,{sx:V.caller,children:`Barrel type wrapper`}),(0,d.jsx)(L,{sx:V.caller,children:`Default imported type wrapper`}),(0,d.jsx)(R,{sx:V.caller,children:`Default barrel type wrapper`}),(0,d.jsx)(z,{sx:V.caller,children:`Local default type wrapper`}),(0,d.jsx)(j,{sx:V.caller,children:`Explicit wrapper`}),(0,d.jsx)(B,{children:`Omit sx wrapper`}),(0,d.jsxs)(`div`,{style:H,children:[(0,d.jsx)(E,{color:`labelMuted`,children:`ABC-123`}),(0,d.jsx)(`span`,{children:`Item title`})]})]});export{U as App,w as DraggableSxButton,S as ExportedAccentButton,C as ExportedToggleButton};