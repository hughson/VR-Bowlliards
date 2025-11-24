import * as CANNON from 'cannon-es';

export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0);
    
    // Use broadphase for better collision detection
    this.world.broadphase = new CANNON.NaiveBroadphase();
    
    // Enhanced contact material for realistic ball physics
    const ballMaterial = new CANNON.Material('ball');
    const tableMaterial = new CANNON.Material('table');
    const cushionMaterial = new CANNON.Material('cushion');
    
    const ballBallContact = new CANNON.ContactMaterial(ballMaterial, ballMaterial, {
      restitution: 0.88,        // Slightly lower for more realistic energy transfer
      friction: 0.012,          // Very low friction between balls
      contactEquationStiffness: 1e8,
      contactEquationRelaxation: 3
    });
    
    const ballTableContact = new CANNON.ContactMaterial(ballMaterial, tableMaterial, {
      restitution: 0.05,        // Almost zero bounce on felt
      friction: 0.15,           // REDUCED from 0.30 - Less friction for longer rolls
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 4
    });
    
    // --- MODIFICATION: Improved restitution for better slow-ball cushion bounce ---
    const ballCushionContact = new CANNON.ContactMaterial(ballMaterial, cushionMaterial, {
      restitution: 0.85,  // Increased from 0.80 to prevent slow-ball sticking
      friction: 0.06,     // Reduced from 0.08 to help slow balls slide off cushions
      contactEquationStiffness: 1e8,  
      contactEquationRelaxation: 3
    });
    // --- END MODIFICATION ---
    
    this.world.addContactMaterial(ballBallContact);
    this.world.addContactMaterial(ballTableContact);
    this.world.addContactMaterial(ballCushionContact);
    
    this.ballMaterial = ballMaterial;
    this.tableMaterial = tableMaterial;
    this.cushionMaterial = cushionMaterial;
    
    // Improved solver settings for better collision response
    const solver = new CANNON.GSSolver();
    solver.iterations = 20;    
    solver.tolerance = 0.0001; 
    this.world.solver = new CANNON.SplitSolver(solver);
    
    // Enable continuous collision detection settings
    this.world.defaultContactMaterial.contactEquationStiffness = 1e9; // Stiffer contacts
    this.world.defaultContactMaterial.contactEquationRelaxation = 3;
  }

  step(deltaTime) {
    // 240Hz (4ms step) is precise enough for balls up to ~15m/s.
    // We use the Raycast Safety Net in poolTable.js to catch anything faster.
    this.world.step(1 / 240, deltaTime, 20);
  }
}