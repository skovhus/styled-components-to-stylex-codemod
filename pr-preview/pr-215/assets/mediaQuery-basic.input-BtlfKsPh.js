import{j as e,a as r}from"./index-CrR4Sy2L.js";const o=r.div`
  width: 100%;
  padding: 1.5rem;
  background: linear-gradient(135deg, #ffe4b5 0%, #ffd699 100%);
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

  @media (min-width: 768px) {
    width: 750px;
    margin: 0 auto;
    padding: 2rem;
    background: linear-gradient(135deg, #98fb98 0%, #90ee90 100%);
  }

  @media (min-width: 1024px) {
    width: 960px;
    padding: 2.5rem;
    background: linear-gradient(135deg, #87ceeb 0%, #add8e6 100%);
  }
`,t=r.h2`
  margin: 0 0 1rem;
  font-size: 1.5rem;
  color: #333;

  @media (min-width: 768px) {
    font-size: 2rem;
  }

  @media (min-width: 1024px) {
    font-size: 2.5rem;
  }
`,n=r.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;

  @media (min-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 1.5rem;
  }

  @media (min-width: 1024px) {
    grid-template-columns: repeat(3, 1fr);
    gap: 2rem;
  }
`,i=r.div`
  padding: 1rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;

  &:hover {
    @media (hover: hover) {
      transform: translateY(-4px);
      box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
    }
  }
`,a=r.h3`
  margin: 0 0 0.5rem;
  font-size: 1rem;
  color: #555;
`,d=r.p`
  margin: 0;
  font-size: 0.875rem;
  color: #777;
  line-height: 1.5;
`,s=r.button`
  display: block;
  width: 100%;
  margin-top: 1.5rem;
  padding: 12px 24px;
  background: linear-gradient(135deg, #4169e1 0%, #6495ed 100%);
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  color: white;
  font-size: 1rem;
  font-weight: 600;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;

  @media (min-width: 768px) {
    width: auto;
  }

  &:hover {
    @media (hover: hover) {
      transform: scale(1.05);
      box-shadow: 0 4px 12px rgba(65, 105, 225, 0.4);
    }
  }

  &:active {
    transform: scale(0.95);
  }
`,m=()=>e.jsxs(o,{children:[e.jsx(t,{children:"Responsive Media Queries"}),e.jsxs(n,{children:[e.jsxs(i,{children:[e.jsx(a,{children:"Card One"}),e.jsx(d,{children:"Resize the window to see the layout change from 1 to 2 to 3 columns."})]}),e.jsxs(i,{children:[e.jsx(a,{children:"Card Two"}),e.jsx(d,{children:"The background color also changes at different breakpoints."})]}),e.jsxs(i,{children:[e.jsx(a,{children:"Card Three"}),e.jsx(d,{children:"Hover over cards to see the hover effect (on devices that support it)."})]})]}),e.jsx(s,{children:"Interactive Button"})]});export{m as App};
