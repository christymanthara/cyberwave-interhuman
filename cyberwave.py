from cyberwave import Cyberwave

cw = Cyberwave()

drone = cw.twins("dji/dji-mini-4-pro")
drone.takeoff()

robot_dog = cw.twins("unitree/go2")
robot_dog.move_forward()

camera = cw.twins("camera")
camera.start_streaming()

arm = cw.twins("the-robot-studio/so101")
arm.set_joint("1", 30)