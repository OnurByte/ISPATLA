import { expect, test } from "bun:test";
import { fitIsotonicCalibration, calibratedProbability, reliabilityMetrics } from "../src/server/calibration";

test("isotonic calibration pools tied scores before imposing monotonicity and refuses in-sample-sized evidence",()=>{
  const points=[
    {score:.2,hit:true,groupId:"g1"},{score:.2,hit:false,groupId:"g2"},
    {score:.5,hit:false,groupId:"g3"},{score:.5,hit:true,groupId:"g4"},
    {score:.9,hit:true,groupId:"g5"},
  ];
  const profile=fitIsotonicCalibration(points,5);
  expect(profile.status).toBe("calibrated");
  expect(profile.mapping).toEqual([{upperScore:.2,probability:.5,count:2},{upperScore:.5,probability:.5,count:2},{upperScore:.9,probability:1,count:1}]);
  expect(calibratedProbability(.2,profile)).toBe(.5);
  expect(calibratedProbability(.99,profile)).toBe(1);
  expect(fitIsotonicCalibration(points.slice(0,4),5).status).toBe("insufficient");
  expect(calibratedProbability(.5,fitIsotonicCalibration(points.slice(0,4),5))).toBeNull();
});

test("reliability reports proper scores, intervals and nullable empty evaluation",()=>{
  const result=reliabilityMetrics([{probability:.8,hit:true},{probability:.2,hit:false}],2);
  expect(result.sampleCount).toBe(2);expect(result.brier).toBeCloseTo(.04);expect(result.logLoss).toBeCloseTo(-Math.log(.8));expect(result.ece).toBeCloseTo(.2);
  expect(result.reliability.map(bin=>bin.wilson95)).toHaveLength(2);
  expect(reliabilityMetrics([])).toMatchObject({sampleCount:0,brier:null,logLoss:null,ece:null,reliability:[]});
  expect(()=>reliabilityMetrics([{probability:1.1,hit:true}])).toThrow("[0,1]");
});

test("repeated leakage groups count once and contradictory labels are excluded",()=>{
  const rows=Array.from({length:100},(_,index)=>({score:index%2,hit:index%2===0,groupId:`candidate-${index%50}`}));
  const profile=fitIsotonicCalibration([...rows,...rows],50);
  expect(profile.status).toBe("calibrated");
  expect(profile.sampleCount).toBe(50);
  expect(profile.mapping.reduce((sum,bin)=>sum+bin.count,0)).toBe(50);
  const conflicted=fitIsotonicCalibration([...rows,...rows.map(row=>({...row,hit:!row.hit}))],1);
  expect(conflicted).toMatchObject({status:"insufficient",sampleCount:0,mapping:[]});
  const metrics=reliabilityMetrics([
    {probability:.8,hit:true,groupId:"same"},{probability:.8,hit:true,groupId:"same"},
    {probability:.2,hit:false,groupId:"other"},{probability:.8,hit:true,groupId:"other"},
  ],2);
  expect(metrics.sampleCount).toBe(1);
  expect(metrics.brier).toBeCloseTo(.04);
});
