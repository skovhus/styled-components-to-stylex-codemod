import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-d14eW5LA.js";import{p as r,w as i,y as a}from"./helpers-B0y_bjh1.js";t();var o=e=>t=>t.theme.color[e],s=e(),c=n.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: ${e=>`linear-gradient(90deg, transparent, ${o(e.$highlightColor)(e)}, transparent)`};
`,l=n.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: linear-gradient(
    90deg,
    transparent,
    ${e=>o(e.$highlightColor)},
    transparent
  );
`,u=n.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: ${({$shimmerColor:e})=>`linear-gradient(90deg, transparent 0, ${a(e)} 50%, transparent)`};
`,d=n.div`
  position: relative;
  width: 160px;
  height: 20px;
  border-radius: 6px;
  overflow: hidden;
  background-color: #e2e8f0;

  &::after {
    content: "";
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    background-image: linear-gradient(
      90deg,
      transparent 0,
      ${e=>o(e.$shimmerColor)}
      50%,
      transparent
    );
  }
`,f=n.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: ${e=>`linear-gradient(90deg, ${o(e.$startColor)(e)}, ${o(e.$endColor)(e)})`};
`,p=n.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: ${e=>`linear-gradient(90deg, ${o(e.$highlightColor)(e)}, ${o(e.$highlightColor)(e)})`};
`,m=n.div`
  width: 160px;
  min-height: 40px;
  border-radius: 6px;
  padding: 8px;
  color: white;
  background-color: ${e=>o(e.$color??`labelFaint`)(e)} !important;
`,h=n.div`
  width: 160px;
  min-height: 40px;
  border-radius: 6px;
  padding: 8px;
  color: white;
  background-color: ${e=>o(`bgBase`)(e)};
`,g=n.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: ${e=>`linear-gradient(90deg, ${o(e.$highlightColor)(e)} ${e.$size}px, transparent)`};
`,_=n.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-color: white;
  text-shadow: ${e=>i(e.$shadow)};
`,v=n.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-color: white;
  text-shadow: ${e=>`${i(e.$shadowTone)}, ${r(e.$shadowTone)}`};
`,y=()=>{let e=`accent`;return(0,s.jsxs)(`div`,{style:{display:`grid`,gap:8,padding:12},children:[(0,s.jsx)(c,{$highlightColor:`accent`}),(0,s.jsx)(l,{$highlightColor:e}),(0,s.jsx)(u,{$shimmerColor:e}),(0,s.jsx)(d,{$shimmerColor:e}),(0,s.jsx)(f,{$startColor:`labelBase`,$endColor:`accent`}),(0,s.jsx)(p,{$highlightColor:`accent`}),(0,s.jsx)(m,{children:`Default faint panel`}),(0,s.jsx)(m,{$color:`accent`,children:`Accent panel`}),(0,s.jsx)(h,{children:`Static helper panel`}),(0,s.jsx)(g,{$highlightColor:`accent`,$size:12}),(0,s.jsx)(_,{$shadow:`dark`}),(0,s.jsx)(v,{$shadowTone:`light`})]})};export{y as App};