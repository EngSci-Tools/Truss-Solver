# Truss Solver

Example [here](http://truss.aidandevelops.com/truss?joints=%5B%5B%22A%22,%5B-5,0%5D,2%5D,%5B%22B%22,%5B-2.5,4.3301%5D,2%5D,%5B%22C%22,%5B0,0%5D,2%5D,%5B%22D%22,%5B2.5,4.3301%5D,2%5D,%5B%22E%22,%5B-7.5,4.3301%5D,2%5D,%5B%22F%22,%5B-10,0%5D,0%5D,%5B%22G%22,%5B5,0%5D,2%5D,%5B%22H%22,%5B7.5,4.3301%5D,2%5D,%5B%22I%22,%5B10,0%5D,1%5D%5D&members=%5B%5B%22A%22,%22C%22%5D,%5B%22A%22,%22F%22%5D,%5B%22A%22,%22B%22%5D,%5B%22A%22,%22E%22%5D,%5B%22B%22,%22E%22%5D,%5B%22B%22,%22D%22%5D,%5B%22B%22,%22C%22%5D,%5B%22C%22,%22G%22%5D,%5B%22C%22,%22D%22%5D,%5B%22D%22,%22H%22%5D,%5B%22D%22,%22G%22%5D,%5B%22E%22,%22F%22%5D,%5B%22G%22,%22I%22%5D,%5B%22G%22,%22H%22%5D,%5B%22H%22,%22I%22%5D%5D&forces=%5B%5B%22A%22,175,-90%5D,%5B%22C%22,175,-90%5D,%5B%22G%22,175,-90%5D%5D&seperation=%5B2.5,4.3301%5D).

Basic Controls:
1. Pan using right mouse drag and zoom with scroll.
1. There are 4 modes:
   1. Selecting: Left click drag selects points. Left click selects or deselects one point. All properties are editable to the left.
   1. Joint: Left click selects a nearby joint. If there is none, it creates a joint on the nearest grid point. 
   1. Member: Left click selects a nearby joint. Once two are selected, a member is created between them. Selecting another joint will chain the member to that one.
   1. Force: Left click selects a nearby joint. It also places a force of 1kN in the down direction to the joint.

Todo:
- [ ] Add even more truss types to automatic generator. The difficult ones.
- [ ] Make the home page look better.
- [ ] Add more section types beyond square HSS
- [ ] Allow for unit changes
- [ ] Add a deflection solver.
- [ ] Compute second order effects.
- [ ] Create a way to analyze specific members
- [x] Allow users to move joints.
- [X] Compute horizontal reaction forces.
- [X] Add more truss types.
- [X] Create a "Show my work" view.

If you want to solve one of these, shoot me a message on the discord and I will point you to the relative components in the code.
